#!/usr/bin/env python3
"""04-build-ref.py: build and run the gallery's reference renderer off the device (03-gallery-ref.c).

usage: python3 -I 04-build-ref.py host WORK PASSES OUTDIR [ID ...]
       python3 -I 04-build-ref.py rv32 WORK PASSES OUT.jsonl ID [ID ...]

Both builds compile the firmware's own sources (picocalc-os/nucleus/candela_gallery.c, candela_gallery_instance.cpp,
third_party/candela/{kernel,vm,gallery}) with the gallery's floating-point policy: -ffp-contract=off on every file,
-fno-math-errno, -fwrapv, -O2. Two kernel instances, as in the firmware: cg (CPU-KERNEL's cpu arm) and cgs (the same
with CDL_SPECTRAL=1; its adapter is built with CDL_VM_NO_MATH_EXPORTS).

  host  x86-64 gcc; runs gallery-ref PASSES OUTDIR [ID ...] and prints its JSON lines.
  rv32  ESP-IDF 5.4.2's toolchain (esp-14.2.0_20241119) for rv32imafc/ilp32f, bare metal, one ELF per scene, run in
        PICOCALC-CANDELA-SECTIONS' counting interpreter (harness/rv32imfc-count.c): frame-0, accumulation and display
        digests, and instructions per camera sample of the progressive render. Appends one JSON line per scene."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / ".git").exists())
OS = REPO / "picocalc-os"
KD, VD, GD, NU = OS / "third_party/candela/kernel", OS / "third_party/candela/vm", OS / "third_party/candela/gallery", OS / "nucleus"
SE = next((REPO / "ttmp/2026/11/21").glob("PICOCALC-CANDELA-SECTIONS--*")) / "scripts"
TC = "/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf-"
SW = ["LAZY_SELECT", "NO_ZERO_INIT", "FAST_FLOOR", "FAST_TRIG", "FAST_EXP", "INT_HASH", "SKY_TABLE", "POW32"]
FP = ["-O2", "-ffp-contract=off", "-fno-math-errno", "-fwrapv"]
CXX = ["-std=gnu++17", "-fno-exceptions", "-fno-rtti", "-fno-threadsafe-statics", "-w"]
RV = ["-march=rv32imafc_zicsr_zifencei", "-mabi=ilp32f", "-msmall-data-limit=0", "-mno-relax", "-ffunction-sections", "-fdata-sections"]
INC = [f"-I{KD}", f"-I{VD}", f"-I{NU}"]


def run(cmd, **kw):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)
    if r.returncode:
        raise RuntimeError(f"failed ({r.returncode}): {' '.join(map(str, cmd))[:600]}\n{(r.stderr or r.stdout)[-3000:]}")
    return r


def instance(ns, spectral):
    return [f"-DCDL_NS={ns}", "-DCDL_SKY_N=64"] + [f"-DCDL_{s}=1" for s in SW] + (["-DCDL_SPECTRAL=1"] if spectral else [])


def objects(d, cc, cxx, extra):
    d.mkdir(parents=True, exist_ok=True)
    objs = []
    for ns, spectral in (("cg", False), ("cgs", True)):
        for src in (KD / "cdl_kernel.cpp", KD / "cdl_post.cpp", NU / "candela_gallery_instance.cpp"):
            o = d / f"{ns}-{src.stem}.o"
            more = ["-DCDL_VM_NO_MATH_EXPORTS"] if spectral and src.stem == "candela_gallery_instance" else []
            run([cxx, *FP, *CXX, *extra, *instance(ns, spectral), *more, *INC, "-c", src, "-o", o])
            objs.append(o)
    for src, more in ((VD / "cdl_vm.c", ["-include", VD / "cdl_vm_ck_math.h"]), (NU / "candela_gallery.c", []), (GD / "candela_gallery_scenes.c", [])):
        o = d / f"{src.stem}.o"
        run([cc, "-std=gnu17", *FP, *extra, *more, *INC, "-c", src, "-o", o])
        objs.append(o)
    return objs


def main():
    a = sys.argv[1:]
    if len(a) < 4 or a[0] not in ("host", "rv32"):
        sys.exit(__doc__)
    mode, work, passes = a[0], Path(a[1]).resolve(), int(a[2])
    if mode == "host":
        outdir, ids = Path(a[3]).resolve(), a[4:]
        outdir.mkdir(parents=True, exist_ok=True)
        objs = objects(work / "host", "gcc", "g++", [])
        exe = work / "host" / "gallery-ref"
        run(["gcc", *FP, *INC, HERE / "03-gallery-ref.c", *objs, "-lstdc++", "-lm", "-o", exe])
        r = subprocess.run([str(exe), str(passes), str(outdir), *ids], text=True, capture_output=True, timeout=36000)
        sys.stdout.write(r.stdout)
        if r.returncode:
            sys.exit(r.stderr[-2000:])
        return
    out, ids = Path(a[3]).resolve(), a[4:]
    objs = objects(work / "rv32", TC + "gcc", TC + "g++", RV)
    count = work / "rv32imfc-count"
    if not count.exists():
        run(["gcc", "-O2", "-o", count, SE / "harness/rv32imfc-count.c", "-lm"])
    rows = [re.match(r'^  \{ "([^"]+)", "(?:[^"\\]|\\.)*", (\d+), (\d+),', line) for line in (GD / "candela_gallery_scenes.c").read_text().splitlines()]
    sizes = {m[1]: (int(m[2]), int(m[3])) for m in rows if m}
    order = list(sizes)
    with out.open("a") as f:
        for sid in ids:
            idx = order.index(sid)
            elf = work / "rv32" / f"{sid}-{passes}.elf"
            run([TC + "gcc", *FP, *RV, *INC, f"-DREF_SCENE={idx}", f"-DREF_PASSES={passes}", "-nostartfiles", "-static",
                 "-Wl,-Ttext=0x10000", "-Wl,-e,_start", "-Wl,--gc-sections", HERE / "03-gallery-ref.c", *objs,
                 "-lstdc++", "-lm", "-lc", "-lgcc", "-o", elf])
            r = subprocess.run([str(count), str(elf), os.devnull], capture_output=True, text=True, timeout=36000)
            if r.returncode:
                raise RuntimeError(f"{sid}: counter exit {r.returncode}: {r.stderr[-1500:]}")
            tags = dict(l.split()[:2] for l in r.stderr.splitlines() if l.split() and l.split()[0] in ("frame0", "acc", "disp"))
            mark = [json.loads(l) for l in r.stderr.splitlines() if l.startswith("{") and '"mark"' in l][-1]
            w, h = sizes[sid]
            rec = {"target": "rv32", "id": sid, "passes": passes, **tags, "instructions": mark["instructions"],
                   "perSample": round(mark["instructions"] / (w * h * passes), 1)}
            f.write(json.dumps(rec) + "\n"); f.flush()
            print(json.dumps(rec), flush=True)


if __name__ == "__main__":
    main()
