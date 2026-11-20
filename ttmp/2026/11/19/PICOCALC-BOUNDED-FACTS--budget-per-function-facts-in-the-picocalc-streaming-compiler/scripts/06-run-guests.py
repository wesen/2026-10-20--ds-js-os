#!/usr/bin/env python3
"""Link PicoCalc-generated RV32 programs and compare emulator results to Wasm."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess

FLAGS = ["-march=rv32im", "-mabi=ilp32", "-mno-relax"]


def run(cc, emulator, directory, entry):
    subprocess.run([cc, *FLAGS, "-nostdlib", "-Wl,--no-relax,-Ttext=0x10000,-e,"+entry,
                    "run.o", "-o", "run.elf"], cwd=directory, check=True)
    return subprocess.run([emulator, "run.elf"], cwd=directory, timeout=10, capture_output=True)


def verify(cc, emulator, directory):
    data = json.loads((directory/"expectations.json").read_text())
    subprocess.run([cc, *FLAGS, "-c", "run.S", "-o", "run.o"], cwd=directory, check=True)
    guest = run(cc, emulator, directory, "_start")
    assert guest.returncode == 0, guest.stderr.decode()
    rows = list(struct.iter_unpack("<iI", guest.stdout))
    assert len(rows) == len(data["expected"])
    expected = data.pop("expected")
    for vector, (value, retired) in zip(expected, rows):
        assert vector["value"] == value and retired > 0, (vector, value, retired)
        vector["retired_including_harness"] = retired
    traps = data.pop("traps")
    for i, trap in enumerate(traps):
        guest = run(cc, emulator, directory, f"trap{i}")
        assert guest.returncode != 0, trap
        assert re.search(rb"ebreak at 0x[\da-f]+", guest.stderr, re.IGNORECASE), (trap, guest.stderr)
    data["returns"] = len(rows)
    data["retired_including_harness"] = sum(retired for _, retired in rows)
    data["expected_traps"] = traps
    packed = b"".join(struct.pack("<i", value) for value, _ in rows)
    data["results_sha256"] = hashlib.sha256(packed).hexdigest()
    if directory.parent.name == "editor-preview-slot":
        data["stats"] = [row for row in data["stats"] if row["name"] == "editorPreviewSlot"]
    if directory.parent.name in ("agenda", "editor-preview-slot"):
        data["vectors"] = expected
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cc", type=Path)
    parser.add_argument("emulator", type=Path)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    cc, emulator = str(args.cc.resolve()), str(args.emulator.resolve())
    receipt = {"gcc": subprocess.check_output([cc, "-dumpfullversion"], text=True).strip(),
               "emulator_sha256": hashlib.sha256(Path(emulator).read_bytes()).hexdigest(),
               "guests": {}}
    names = ["arithmetic", "agenda", "limits"]
    if (args.directory/"editor-preview-slot").is_dir():
        names.append("editor-preview-slot")
    for name in names:
        results = {policy:verify(cc, emulator, args.directory/name/policy)
                   for policy in ("control", "always", "select")}
        assert len({r["results_sha256"] for r in results.values()}) == 1
        receipt["guests"][name] = results
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
