#!/usr/bin/env python3
"""01-build-cpp-ref.py: build and run 01-cpp-ref.c, the gallery's C++ kernel arm on x86-64 (PICOCALC-CANDELA-TYPED).

usage: python3 -I 01-build-cpp-ref.py WORK PASSES OUTDIR [ID ...]

Compiles the firmware's own sources with the gallery's floating-point policy and switches, as PICOCALC-CANDELA-GALLERY
scripts/04-build-ref.py does for its host build: two kernel instances (cg, and cgs with CDL_SPECTRAL), the section
interpreter, the renderer core and the scene table; then runs cpp-ref, which writes OUTDIR/ID.frame0.f32 and ID.acc.f32."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / "AGENTS.md").exists())
FW = REPO / "firmware"
KD, VD, GD, NU = FW / "third_party/candela/kernel", FW / "third_party/candela/vm", FW / "third_party/candela/gallery", FW / "nucleus"
SW = ["LAZY_SELECT", "NO_ZERO_INIT", "FAST_FLOOR", "FAST_TRIG", "FAST_EXP", "INT_HASH", "SKY_TABLE", "POW32"]
FP = ["-O2", "-ffp-contract=off", "-fno-math-errno", "-fwrapv"]
CXX = ["-std=gnu++17", "-fno-exceptions", "-fno-rtti", "-fno-threadsafe-statics", "-w"]
INC = [f"-I{KD}", f"-I{VD}", f"-I{NU}"]


def run(cmd):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"failed: {' '.join(map(str, cmd))[:400]}\n{r.stderr[-3000:]}")
    return r


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    work, passes, out, ids = Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve(), sys.argv[4:]
    work.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    objs = []
    for ns, spectral in (("cg", False), ("cgs", True)):
        for src in (KD / "cdl_kernel.cpp", KD / "cdl_post.cpp", NU / "candela_gallery_instance.cpp"):
            o = work / f"{ns}-{src.stem}.o"
            defs = [f"-DCDL_NS={ns}", "-DCDL_SKY_N=64"] + [f"-DCDL_{s}=1" for s in SW] + (["-DCDL_SPECTRAL=1"] if spectral else [])
            if spectral and src.stem == "candela_gallery_instance":
                defs.append("-DCDL_VM_NO_MATH_EXPORTS")
            run(["g++", *FP, *CXX, *defs, *INC, "-c", src, "-o", o])
            objs.append(o)
    for src, more in ((VD / "cdl_vm.c", ["-include", VD / "cdl_vm_ck_math.h"]), (NU / "candela_gallery.c", []), (GD / "candela_gallery_scenes.c", [])):
        o = work / f"{src.stem}.o"
        run(["gcc", "-std=gnu17", *FP, *more, *INC, "-c", src, "-o", o])
        objs.append(o)
    exe = work / "cpp-ref"
    run(["gcc", *FP, *INC, HERE / "01-cpp-ref.c", *objs, "-lstdc++", "-lm", "-o", exe])
    r = subprocess.run([str(exe), passes, str(out), *ids], text=True, capture_output=True)
    sys.stdout.write(r.stdout)
    if r.returncode:
        sys.exit(r.stderr[-2000:])


if __name__ == "__main__":
    main()
