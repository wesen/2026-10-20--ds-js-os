#!/usr/bin/env python3
"""Undo 02-emulator-runtime.py's move: the freestanding C runtime returns to cji/tools/rv32/fw/.

usage: python3 04-return-cji-runtime.py        (runs once)

02 moved libc.c, hostcalls.S, softfloat.c and include/ to bench/emu/fw/ as "the emulator's runtime". They are cji's
freestanding runtime: besides the emulator's test programs, the firmware's device-compiler tool links them
(picocalc-os/port/esp32p4/compiler/build-tool.sh, $fw/{libc,softfloat}.c, hostcalls.S, include/), and the P4 CMake
names them as dependencies. The first playable build after 02 failed with
"ninja: error: '.../cji/tools/rv32/fw/libc.c', needed by 'cji/tool/compiler.elf.z', missing". Firmware must not
depend on bench/, so the files go back, cji's Makefile and nw-test.sh name them as before, and bench/emu/Makefile
builds its three objects from cji/tools/rv32/fw/.
"""
import subprocess
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())

def edit(path, pairs):
    p = REPO / path; s = p.read_text()
    for old, new, count in pairs:
        assert s.count(old) == count, (path, old, s.count(old))
        s = s.replace(old, new)
    p.write_text(s)

for name in ("libc.c", "hostcalls.S", "softfloat.c", "include"):
    subprocess.run(["git", "mv", f"bench/emu/fw/{name}", f"cji/tools/rv32/fw/{name}"], cwd=REPO, check=True)
fw = REPO / "bench/emu/fw"
assert not any(fw.iterdir()), list(fw.iterdir())
fw.rmdir()
edit("cji/Makefile", [
    ("-isystem ../bench/emu/fw/include", "-isystem tools/rv32/fw/include", 1),
    ("../bench/emu/fw/libc.c", "tools/rv32/fw/libc.c", 2),
    ("../bench/emu/fw/hostcalls.S", "tools/rv32/fw/hostcalls.S", 2),
    ("../bench/emu/fw/softfloat.c", "tools/rv32/fw/softfloat.c", 3),
    ("$(wildcard ../bench/emu/fw/include/*.h)", "$(wildcard tools/rv32/fw/include/*.h)", 1),
    ("$(wildcard ../bench/emu/fw/include/*.h ../bench/emu/fw/include/sys/*.h)", "$(wildcard tools/rv32/fw/include/*.h tools/rv32/fw/include/sys/*.h)", 1),
])
edit("cji/tools/rv32/nw-test.sh", [("-isystem ../bench/emu/fw/include", "-isystem tools/rv32/fw/include", 1)])
for f in ("cji/tools/rv32/fw/hostcalls.S", "cji/tools/rv32/fw/softfloat.c"):
    p = REPO / f; p.write_text(p.read_text().replace("bench/emu/fw/", "tools/rv32/fw/"))
edit("bench/emu/Makefile", [
    ("# rv32emu, the RV32IMF emulator that runs the host replays, the Chess oracle and cji's tests, and its minimal C\n"
     "# runtime: a small libc, the host-call stubs the emulator answers, and soft-float helpers (fw/). Programs that run on\n"
     "# the emulator link against build/{libc,hostcalls,softfloat}.o, which the replays find next to the emulator.\n",
     "# rv32emu, the RV32IMF emulator that runs the host replays, the Chess oracle and cji's tests, and the three objects\n"
     "# the replays' programs link against (found next to the emulator): cji's freestanding C runtime (a small libc, the\n"
     "# host-call stubs the emulator answers, soft-float helpers). That runtime lives in cji/tools/rv32/fw/ because the\n"
     "# firmware's device-compiler tool links it too.\n", 1),
    ("-isystem fw/include", "-isystem $(FW)/include", 1),
    ("OBJECTS := build/libc.o", "FW      := ../../cji/tools/rv32/fw\nOBJECTS := build/libc.o", 1),
    ("build/%.o: fw/%.c Makefile $(wildcard fw/include/*.h fw/include/sys/*.h)", "build/%.o: $(FW)/%.c Makefile $(wildcard $(FW)/include/*.h $(FW)/include/sys/*.h)", 1),
    ("build/%.o: fw/%.S Makefile", "build/%.o: $(FW)/%.S Makefile", 1),
])
leftover = subprocess.run(["git", "grep", "-n", "bench/emu/fw", "--", ".", ":!ttmp"], cwd=REPO, capture_output=True, text=True).stdout
assert not leftover, leftover
print("runtime returned to cji/tools/rv32/fw")
