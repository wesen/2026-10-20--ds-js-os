#!/usr/bin/env python3
"""07-typed-ref.py: the Typed arm's reference digests for the device (PICOCALC-CANDELA-TYPED; copied to PICOCALC-CANDELA-KERNEL-CODEGEN).

usage: python3 -I 07-typed-ref.py WORK PASSES OUT.jsonl [--host] [ID ...]

Runs 07-typed-dump.mjs (the generated Typed program's WebAssembly build, bit-identical to its RV32 build: every pixel
output of PASSES passes per scene, into WORK/dump), then replays the dumps through the gallery's renderer core
(nucleus/candela_gallery.c, the gallery's scene table, the gallery's floating-point policy) and writes one JSON line
per scene: frame0, acc and disp, as `gallery digest ID PASSES psram typed` prints them on the device.

By default the replay is built for rv32imafc/ilp32f with ESP-IDF's toolchain and newlib and runs in
PICOCALC-CANDELA-SECTIONS' counting interpreter, as PICOCALC-CANDELA-GALLERY's C++ reference does: the display pass
calls libm, and an x86-64 build (--host) gives other display digests on some scenes (F-01, G-02 ... ; frame0 and acc
agree)."""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / "AGENTS.md").exists())
FW = REPO / "firmware"
GD = FW / "third_party/candela/gallery"
COUNT_SRC = next((REPO / "ttmp/2026/11/21").glob("PICOCALC-CANDELA-SECTIONS--*")) / "scripts/harness/rv32imfc-count.c"
TC = str(Path.home() / ".espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf-")
FP = ["-O2", "-ffp-contract=off", "-fno-math-errno", "-fwrapv"]
RV = ["-march=rv32imafc_zicsr_zifencei", "-mabi=ilp32f", "-msmall-data-limit=0", "-mno-relax", "-ffunction-sections", "-fdata-sections"]
INC = [f"-I{FW / 'third_party/candela/kernel'}", f"-I{FW / 'nucleus'}"]


def run(cmd, **kw):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)
    if r.returncode:
        sys.exit(f"failed ({r.returncode}): {' '.join(map(str, cmd))[:500]}\n{(r.stderr or r.stdout)[-2000:]}")
    return r


def scene_order():
    import re
    rows = [re.match(r'^  \{ "([^"]+)", "(?:[^"\\]|\\.)*", (\d+), (\d+),', l) for l in (GD / "candela_gallery_scenes.c").read_text().splitlines()]
    return [m[1] for m in rows if m]


def main():
    args = sys.argv[1:]
    host = "--host" in args
    args = [x for x in args if x != "--host"]
    if len(args) < 3:
        sys.exit(__doc__)
    work, passes, out, ids = Path(args[0]).resolve(), args[1], Path(args[2]).resolve(), args[3:]
    dump = work / "dump"
    dump.mkdir(parents=True, exist_ok=True)
    ids = run(["node", HERE / "07-typed-dump.mjs", dump, passes, *ids]).stdout.split()
    lines = []
    if host:
        exe = work / "typed-ref"
        run(["gcc", "-std=gnu17", *FP, *INC, HERE / "07-typed-ref.c", FW / "nucleus/candela_gallery.c",
             GD / "candela_gallery_scenes.c", "-lm", "-o", exe])
        lines = run([exe, passes, dump, *ids]).stdout.splitlines()
    else:
        rv = work / "rv32"
        rv.mkdir(exist_ok=True)
        count = work / "rv32imfc-count"
        if not count.exists():
            run(["gcc", "-O2", "-o", count, COUNT_SRC, "-lm"])
        objs = []
        for src in (FW / "nucleus/candela_gallery.c", GD / "candela_gallery_scenes.c"):
            o = rv / f"{src.stem}.o"
            run([TC + "gcc", "-std=gnu17", *FP, *RV, *INC, "-c", src, "-o", o])
            objs.append(o)
        order = scene_order()
        for sid in ids:
            elf = rv / f"{sid}.elf"
            run([TC + "gcc", "-std=gnu17", *FP, *RV, *INC, f"-DREF_SCENE={order.index(sid)}", f"-DREF_PASSES={passes}",
                 f'-DREF_DUMP="{dump / (sid + ".typed.f32")}"', "-nostartfiles", "-static", "-Wl,-Ttext=0x10000",
                 "-Wl,-e,_start", "-Wl,--gc-sections", HERE / "07-typed-ref.c", *objs, "-lm", "-lc", "-lgcc", "-o", elf])
            r = subprocess.run([str(count), str(elf), "/dev/null"], capture_output=True, text=True, timeout=36000)
            if r.returncode:
                sys.exit(f"{sid}: counter exit {r.returncode}: {r.stderr[-1500:]}")
            tags = dict(l.split()[:2] for l in r.stderr.splitlines() if l.split() and l.split()[0] in ("frame0", "acc", "disp"))
            lines.append(json.dumps({"target": "typed-rv32", "id": sid, "passes": int(passes), **tags}))
            print(lines[-1], flush=True)
    out.write_text("".join(l + "\n" for l in lines))
    if host:
        sys.stdout.write(out.read_text())


if __name__ == "__main__":
    main()
