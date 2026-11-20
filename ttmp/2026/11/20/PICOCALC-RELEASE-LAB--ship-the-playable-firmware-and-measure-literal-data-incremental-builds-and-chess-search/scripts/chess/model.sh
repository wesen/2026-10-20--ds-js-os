#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
work=$(realpath "$1")
gcc=$(realpath "$2")
cc -O2 "$repo/cji/tools/rv32/emu.c" -lm -o "$work/rv32emu"
cd "$work/main"
"$gcc" -march=rv32im -mabi=ilp32 -O2 -nostdlib -fno-builtin -msmall-data-limit=0 \
    -mno-relax -Wl,-Ttext=0x10000 -Wl,-e,_start -I. "$here/model.c" engine.S -o "$work/model.elf"
"$work/rv32emu" "$work/model.elf" > "$work/modeled.bin"
python3 - "$work" <<'PY'
import json
from pathlib import Path
import struct
import sys

root = Path(sys.argv[1])
host = json.loads((root / "main/host.json").read_text())
keys = ("bestMove", "score", "completed", "nodes", "slices")
model = list(struct.iter_unpack("<5iQ", (root / "modeled.bin").read_bytes()))
assert len(model) == len(host["expected"])
for values, host_row in zip(model, host["expected"]):
    assert values[:5] == tuple(host_row["result"][field] for field in keys)
report = {"rv32Sha256":host["rv32Sha256"], "digest":host["digest"], "scopes":
          "RV32 instructions during start-to-final-slice plus freestanding loop/accounting",
          "instructions":[row[5] for row in model]}
(root / "modeled.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report))
PY
