#!/usr/bin/env python3
"""Phase A, second part: the emulator's C runtime joins the emulator, and the copied replays' last relative imports.

usage: python3 02-emulator-runtime.py        (runs once, after 01-promote-host-gates.py)

The replays link each test program against libc.o, hostcalls.o and softfloat.o found next to the emulator
(dirname(emu)). Those are the emulator's minimal C runtime (a small libc, the host-call stubs the emulator answers,
soft-float helpers), built from cji/tools/rv32/fw/. They are as general as the emulator, so libc.c, hostcalls.S,
softfloat.c and include/ move to bench/emu/fw/, and bench/emu/Makefile builds the three objects beside rv32emu.
cji's own test firmware (main.c, nw_main.c, board_*, elf_load.c, ref_module.*, stage1_main.c) stays in cji, and
cji's Makefile and nw-test.sh name the runtime at its new place.
The copied replays also import worlds/*/compile.js through six-level relative paths; those become three-level.
"""
import re, subprocess
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())

def edit(path, pairs):
    p = REPO / path; s = p.read_text()
    for old, new, count in pairs:
        assert s.count(old) == count, (path, old, s.count(old))
        s = s.replace(old, new)
    p.write_text(s)

for p in sorted((REPO / "bench/host/replays").glob("*.mjs")):
    s = p.read_text(); t = s.replace("'../../../../../../picocalc-os/", "'../../../picocalc-os/")
    if t != s:
        p.write_text(t); print("imports fixed:", p.name)
    assert "../../../../../../" not in t, p

(REPO / "bench/emu/fw").mkdir(exist_ok=True)
for name in ("libc.c", "hostcalls.S", "softfloat.c", "include"):
    subprocess.run(["git", "mv", f"cji/tools/rv32/fw/{name}", f"bench/emu/fw/{name}"], cwd=REPO, check=True)

edit("cji/Makefile", [
    ("-isystem tools/rv32/fw/include", "-isystem ../bench/emu/fw/include", 1),
    ("tools/rv32/fw/libc.c", "../bench/emu/fw/libc.c", 2),
    ("tools/rv32/fw/hostcalls.S", "../bench/emu/fw/hostcalls.S", 2),
    ("tools/rv32/fw/softfloat.c", "../bench/emu/fw/softfloat.c", 3),
    ("$(wildcard tools/rv32/fw/include/*.h)", "$(wildcard ../bench/emu/fw/include/*.h)", 1),
    ("$(wildcard tools/rv32/fw/include/*.h tools/rv32/fw/include/sys/*.h)", "$(wildcard ../bench/emu/fw/include/*.h ../bench/emu/fw/include/sys/*.h)", 1),
])
edit("cji/tools/rv32/nw-test.sh", [("-isystem tools/rv32/fw/include", "-isystem ../bench/emu/fw/include", 1)])
for f in ("bench/emu/fw/hostcalls.S", "bench/emu/fw/softfloat.c"):
    p = REPO / f; p.write_text(p.read_text().replace("tools/rv32/fw/", "bench/emu/fw/"))
leftover = subprocess.run(["git", "grep", "-n", r"tools/rv32/fw/\(libc\|hostcalls\|softfloat\|include\)", "--", "cji"], cwd=REPO, capture_output=True, text=True).stdout
assert not leftover, leftover
print("runtime moved to bench/emu/fw")
