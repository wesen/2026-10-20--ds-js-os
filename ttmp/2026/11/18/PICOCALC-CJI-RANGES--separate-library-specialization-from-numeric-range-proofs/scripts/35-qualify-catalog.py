"""Qualify a completed host catalog run, including rejections from a memory-matched control."""
import argparse
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("rows", type=Path)
parser.add_argument("errors", type=Path, help="ordinary/candidate diagnostic files from script 32")
args = parser.parse_args()
rows = [json.loads(line) for line in args.rows.read_text().splitlines()]
ledger = next(Path("ttmp/2026/11/17").glob("*CJI-PORT*/various/device-catalog-results.json"))
modules = {r["world"]: r.get("host_elf_sha256") for r in json.loads(ledger.read_text())["worlds"]}
if len(rows) != len(modules) or {r["world"] for r in rows} != set(modules):
    raise ValueError("incomplete or duplicated catalog")
accepted = []
rejected = {}
for row in rows:
    name = row["world"]
    if modules[name]:
        if row["status"] != 0 or not row["reference_match"] or row["elf_sha256"] != modules[name]:
            raise ValueError(f"{name}: output identity mismatch")
        accepted.append(name)
        continue
    def diagnostic(text):
        cap = re.search(r"out of memory: .*?past its cap of (\d+)", text)
        if cap:
            return f"out of memory at {cap[1]} bytes"
        return next((line for line in text.splitlines() if "Error:" in line), None)
    ordinary = diagnostic((args.errors / f"{name}-control.log").read_text())
    status = int((args.errors / f"{name}-control.status").read_text())
    if not status or not ordinary or row["status"] != status or diagnostic(row["error"]) != ordinary:
        raise ValueError(f"{name}: rejection differs from capped control")
    rejected[name] = dict(exit_code=status, reason=ordinary, node_reference_diagnostic_matches=row["reference_match"])
print(json.dumps(dict(matched_modules=accepted, matched_capped_rejections=rejected), indent=2))
