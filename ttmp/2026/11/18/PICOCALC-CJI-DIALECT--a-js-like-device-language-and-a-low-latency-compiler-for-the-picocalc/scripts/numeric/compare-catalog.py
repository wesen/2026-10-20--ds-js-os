"""Compare capped native catalog outcomes while permitting changed code."""
import argparse
import json
from pathlib import Path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("control", type=Path)
parser.add_argument("candidate", type=Path)
args = parser.parse_args()


def read(path):
    rows = (json.loads(line) for line in path.read_text().splitlines())
    return {r["world"]: r for r in rows}


control = read(args.control)
candidate = read(args.candidate)
if control.keys() != candidate.keys():
    raise ValueError("catalog inputs contain different worlds")
receipt = []
for name, row in candidate.items():
    ref = control[name]
    if row["mib"] != ref["mib"]:
        raise ValueError(f"{name}: different compiler heap caps")
    if not row["status"] and not row["elf_sha256"]:
        raise ValueError(f"{name}: a successful compile lacks linked ELF evidence")
    result = dict(world=name, mib=row["mib"], control_status=ref["status"], status=row["status"],
                  control_elf_sha256=ref["elf_sha256"], elf_sha256=row["elf_sha256"],
                  slir_sha256=row["sha256"], elapsed_s=row["elapsed_s"], live_peak_bytes=row["live_peak_bytes"],
                  metrics=row["metrics"], diagnostic=row["error"], control_diagnostic=ref["error"])
    receipt.append(result)

accepts = [r for r in receipt if r["status"] == 0]
print(json.dumps(dict(successes=len(accepts), matching_control_status=sum(r["status"] == r["control_status"] for r in receipt),
                      matching_control_elf=[r["world"] for r in accepts if r["elf_sha256"] == r["control_elf_sha256"]],
                      rows=receipt), indent=2))
