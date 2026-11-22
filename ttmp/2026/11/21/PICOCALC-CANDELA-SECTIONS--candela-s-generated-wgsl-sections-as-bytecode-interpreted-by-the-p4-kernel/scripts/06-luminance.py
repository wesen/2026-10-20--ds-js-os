#!/usr/bin/env python3
"""06-luminance.py: whole-frame mean luminance, compiled sections against interpreted sections (design Section 8).

usage: python3 -I 06-luminance.py CANDELA_RUN WORK_DIR OUT.jsonl [--size 160] [--spp 64] PRESET ...

For each preset: export at SIZE x SIZE (01-export-sections.mjs), translate (02-translate-all.mjs), translate the
whole program with PICOCALC-CANDELA-P4's 04-wgsl2cpp.mjs, rewrite it (harness/rewrite-kernel.py), build the harness
natively with MODE=0 (compiled) and MODE=1 (interpreted), render SPP samples per pixel with frame indices 0..SPP-1,
and compare mean luminance 0.2126 R + 0.7152 G + 0.0722 B. Also records the fraction of pixels equal bit for bit and
the largest per-pixel relative luminance difference."""
import json
import os
import struct
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
P4 = os.path.join(HERE, "..", "..", "PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4", "scripts")
args = sys.argv[1:]
size, spp = 160, 64
if "--size" in args: i = args.index("--size"); size = int(args[i + 1]); del args[i:i + 2]
if "--spp" in args: i = args.index("--spp"); spp = int(args[i + 1]); del args[i:i + 2]
root, work, out, presets = args[0], args[1], args[2], args[3:]
exp = os.path.join(work, f"export{size}")
os.makedirs(exp, exist_ok=True)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"failed: {' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r


run(["node", os.path.join(HERE, "01-export-sections.mjs"), root, exp, str(size), str(size), *presets])
run(["node", os.path.join(HERE, "02-translate-all.mjs"), exp, os.path.join(exp, "translate.json"), *presets])
vm_obj = os.path.join(work, "cdl_vm.o")
run(["gcc", "-std=c99", "-O2", "-fno-math-errno", "-c", os.path.join(HERE, "vm", "cdl_vm.c"), "-o", vm_obj])


def lum_frame(path):
    b = open(path, "rb").read()
    v = struct.unpack(f"<{len(b) // 4}f", b)
    return [0.2126 * v[i] + 0.7152 * v[i + 1] + 0.0722 * v[i + 2] for i in range(0, len(v), 3)], b


with open(out, "w") as f:
    for p in presets:
        d = os.path.join(exp, p)
        run(["node", os.path.join(P4, "04-wgsl2cpp.mjs"), os.path.join(d, "kernel.wgsl"), os.path.join(d, "kernel.cpp")])
        run(["python3", "-I", os.path.join(HERE, "harness", "rewrite-kernel.py"), os.path.join(d, "kernel.cpp"), os.path.join(d, "kernel-rw.cpp")])
        res = {}
        for mode, name in ((0, "compiled"), (1, "vm")):
            exe = os.path.join(d, f"{name}-s{spp}.exe")
            run(["g++", "-std=c++17", "-O2", "-fno-math-errno", "-w", f"-DMODE={mode}", f"-DSPP={spp}", f'-DKERNEL="{os.path.join(d, "kernel-rw.cpp")}"',
                 "-I", os.path.join(HERE, "vm"), os.path.join(HERE, "harness", "harness.cpp"), vm_obj, "-o", exe, "-lm"])
            t0 = time.time()
            run([exe, os.path.join(d, "scene.bin"), os.path.join(d, "prog.cdvm"), os.path.join(d, f"{name}-s{spp}.rgbf")])
            res[name] = (lum_frame(os.path.join(d, f"{name}-s{spp}.rgbf")), time.time() - t0)
        (la, ba), ta = res["compiled"]
        (lb, bb), tb = res["vm"]
        ma, mb = sum(la) / len(la), sum(lb) / len(lb)
        same = sum(1 for i in range(len(la)) if ba[12 * i:12 * i + 12] == bb[12 * i:12 * i + 12])
        worst = max((abs(x - y) / max(abs(x), abs(y), 1e-30) for x, y in zip(la, lb)), default=0)
        o = {"preset": p, "size": size, "spp": spp, "meanLumCompiled": ma, "meanLumVm": mb, "ratio": mb / ma if ma else None,
             "pixelsBitIdentical": same, "pixels": len(la), "maxPixelRelDiff": worst, "hostSecondsCompiled": round(ta, 2), "hostSecondsVm": round(tb, 2)}
        f.write(json.dumps(o) + "\n"); f.flush()
        print(f"{p}: mean luminance compiled {ma:.6g}, interpreted {mb:.6g}, ratio {mb / ma:.6f}; {same}/{len(la)} pixels bit-identical; host {ta:.1f} s / {tb:.1f} s", flush=True)
