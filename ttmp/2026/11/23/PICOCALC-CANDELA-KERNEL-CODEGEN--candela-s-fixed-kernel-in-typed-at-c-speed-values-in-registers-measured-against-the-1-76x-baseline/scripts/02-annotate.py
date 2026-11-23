#!/usr/bin/env python3
"""02-annotate.py: one function of a dumped RV32 image, disassembled with GNU objdump, each instruction with its
execution count per sample (PICOCALC-CANDELA-KERNEL-CODEGEN).

usage: python3 -I 02-annotate.py DUMPDIR SCENE FUNCTION [--min X]

DUMPDIR holds image.bin, entries.json and SCENE.counts.json from 01-count.mjs --dump."""
import json
import subprocess
import sys
from pathlib import Path

OBJDUMP = str(Path.home() / ".espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf-objdump")


def main():
    args = sys.argv[1:]
    least = 0.0
    if "--min" in args:
        i = args.index("--min")
        least = float(args[i + 1])
        del args[i:i + 2]
    if len(args) != 3:
        sys.exit(__doc__)
    d, scene, fn = Path(args[0]), args[1], args[2]
    entries = json.loads((d / "entries.json").read_text())
    c = json.loads((d / f"{scene}.counts.json").read_text())
    samples, counts = c["samples"], c["counts"]
    starts = sorted(entries.values())
    start = entries[fn]
    later = [s for s in starts if s > start]
    end = later[0] if later else 4 * len(counts)
    out = subprocess.run([OBJDUMP, "-D", "-b", "binary", "-m", "riscv:rv32", "-M", "numeric",
                          f"--start-address={start}", f"--stop-address={end}", str(d / "image.bin")],
                         capture_output=True, text=True, check=True).stdout
    total = 0.0
    for line in out.splitlines():
        parts = line.split(":", 1)
        try:
            at = int(parts[0].strip(), 16)
        except ValueError:
            continue
        n = counts[at >> 2] / samples
        total += n
        if n >= least:
            print(f"{n:9.3f} {line.strip()}")
    print(f"total {total:.1f} per sample")


if __name__ == "__main__":
    main()
