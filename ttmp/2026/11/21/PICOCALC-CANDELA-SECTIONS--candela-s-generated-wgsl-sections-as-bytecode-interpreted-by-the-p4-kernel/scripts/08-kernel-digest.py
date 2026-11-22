#!/usr/bin/env python3
"""08-kernel-digest.py: the bytecode inside PICOCALC-CANDELA-CPU-KERNEL's fixed kernel, against that kernel's own
compiled sections: per-pixel digests on the host, and RV32 instructions per sample (design Sections 8 and 9).

usage: python3 -I 08-kernel-digest.py --ck CK_SCRIPTS CANDELA_ROOT EXPORT_DIR WORK_DIR OUT.jsonl
           [--arms lazy,cpu] [--spp 4] [--size 80] [--jobs 4] [--rv32] [--rv32-nofma] PRESET ...

CK_SCRIPTS is the CPU-KERNEL ticket's scripts/ directory (generated/, cpu/, 03-gen-scene.mjs); it is only read.
A preset that the kernel ticket did not generate is generated into WORK_DIR/gen with its 03-gen-scene.mjs at
SIZE x SIZE. The bytecode comes from EXPORT_DIR (01-export-sections.mjs, the same pinned Candela), translated again.

Per arm (the kernel ticket's switch sets: lazy = Candela's arithmetic, cpu = every CPU substitution) and preset:
  host   one executable (ck/driver.c) with both section tables; it renders frames 0..SPP-1 with the compiled sections
         and again with the bytecode (ck/cdl_vm_sections.cpp, vm/cdl_vm.c with the instance's floor, sin, cos and exp
         through ck/cdl_vm_ck_math.h). Each pixel's digest is FNV-1a over its 48-byte cdl_pixout in every frame;
         frame 0's digest is the kernel ticket's frame digest. Records pixels with equal digests.
  rv32   (--rv32) the same instance for rv32imafc/ilp32f with the kernel ticket's flags, frame 0 counted per row in
         harness/rv32imfc-count.c, compiled sections against bytecode; a per-function profile splits the bytecode
         run into interpreter, adapter and kernel. --rv32-nofma repeats it with -ffp-contract=off everywhere, so the
         compiled sections cannot fuse a*b+c into one rounding where the interpreter rounds twice.
One JSON line per preset, arm and target."""
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
VM, CKD = os.path.join(HERE, "vm"), os.path.join(HERE, "ck")
TC = "/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-"
RV = ["-march=rv32imafc_zicsr_zifencei", "-mabi=ilp32f"]
COMMON = ["-fno-math-errno", "-fwrapv"]
RVCOMMON = COMMON + ["-msmall-data-limit=0", "-mno-relax"]
CXX = ["-std=gnu++17", "-fno-exceptions", "-fno-rtti", "-fno-threadsafe-statics", "-w"]
SW = ["LAZY_SELECT", "NO_ZERO_INIT", "FAST_FLOOR", "FAST_TRIG", "FAST_EXP", "INT_HASH", "SKY_TABLE", "POW32"]
# 04-build.py's arms: lazy = Candela's arithmetic with select evaluating only the chosen value (the eager "wgsl" arm
# divides by zero in hdriTexel when a scene has no HDRI, which traps on x86-64), cpu = every CPU substitution
ARMS = {"wgsl": [], "lazy": ["LAZY_SELECT"], "cpu": SW}

args = sys.argv[1:]
opt = {"--arms": "lazy,cpu", "--spp": "4", "--size": "80", "--jobs": "4", "--ck": None}
flags = set()
for k in list(opt):
    if k in args:
        i = args.index(k); opt[k] = args[i + 1]; del args[i:i + 2]
for k in ("--rv32", "--rv32-nofma"):
    if k in args: flags.add(k); args.remove(k)
if not opt["--ck"] or len(args) < 5:
    sys.exit(__doc__)
CK = os.path.abspath(opt["--ck"])
GEN, CPU = os.path.join(CK, "generated"), os.path.join(CK, "cpu")
root, export, work, out = (os.path.abspath(a) for a in args[:4])
presets = args[4:]
arms = opt["--arms"].split(",")
spp, size, jobs = int(opt["--spp"]), int(opt["--size"]), int(opt["--jobs"])
os.makedirs(work, exist_ok=True)


def run(cmd, **kw):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)
    if r.returncode:
        raise RuntimeError(f"failed ({r.returncode}): {' '.join(map(str, cmd))[:400]}\n{(r.stderr or r.stdout)[-2000:]}")
    return r


def ns(arm): return "cdl_" + arm.replace("-", "_")
def cid(p): return p.replace("-", "_")
def defines(arm, sp=False): return [f"-DCDL_NS={ns(arm)}", "-DCDL_SKY_N=64"] + [f"-DCDL_{s}=1" for s in ARMS[arm]] + (["-DCDL_SPECTRAL=1"] if sp else [])
def sub(arm, sp): return arm + ("-spectral" if sp else "")


# ---- scenes: the kernel ticket's, or generated with its 03-gen-scene.mjs ----
scene_dir = {}
gen_out = os.path.join(work, "gen")
os.makedirs(gen_out, exist_ok=True)
for p in presets:
    if os.path.exists(os.path.join(GEN, "scenes", p + ".cpp")):
        scene_dir[p] = os.path.join(GEN, "scenes")
    else:
        if not os.path.exists(os.path.join(gen_out, p + ".cpp")):
            run(["node", os.path.join(CK, "03-gen-scene.mjs"), root, GEN, p, size, size, gen_out])
        scene_dir[p] = gen_out
run(["node", os.path.join(HERE, "02-translate-all.mjs"), export, os.path.join(work, "translate.json"), *presets])
prog = {p: os.path.join(export, p, "prog.cdvm") for p in presets}
spec = {p: bool(json.load(open(os.path.join(scene_dir[p], p + ".json"))).get("spectral")) for p in presets}   # spectral scenes need a CDL_SPECTRAL=1 instance


# ---- host builds ----
def host_objs(key):
    arm, sp = key
    d = os.path.join(work, "host", sub(arm, sp))
    os.makedirs(d, exist_ok=True)
    objs = []
    for src in (os.path.join(GEN, "cdl_kernel.cpp"), os.path.join(GEN, "cdl_post.cpp"), os.path.join(CKD, "cdl_vm_sections.cpp")):
        o = os.path.join(d, os.path.basename(src) + ".o")
        run(["g++", "-O2", *COMMON, *CXX, *defines(arm, sp), f"-I{CPU}", f"-I{GEN}", f"-I{VM}", "-c", src, "-o", o])
        objs.append(o)
    o = os.path.join(d, "cdl_vm.o")
    run(["gcc", "-std=c99", "-O2", *COMMON, "-include", os.path.join(CKD, "cdl_vm_ck_math.h"), f"-I{VM}", "-c", os.path.join(VM, "cdl_vm.c"), "-o", o])
    return objs + [o]


def host_one(arm, p, objs):
    sp = spec[p]
    d = os.path.join(work, "host", sub(arm, sp), p)
    os.makedirs(d, exist_ok=True)
    so = os.path.join(d, "scene.o")
    run(["g++", "-O2", *COMMON, *CXX, *defines(arm, sp), f"-I{CPU}", f"-I{GEN}", f"-I{scene_dir[p]}", "-c", os.path.join(scene_dir[p], p + ".cpp"), "-o", so])
    exe = os.path.join(d, "driver")
    run(["gcc", "-O2", f"-DCDL_NS={ns(arm)}", f"-DCDL_SECTIONS={ns(arm)}_sections_{cid(p)}", f"-I{CPU}", os.path.join(CKD, "driver.c"), so, *objs, "-lstdc++", "-lm", "-o", exe])
    bin_ = os.path.join(scene_dir[p], p + ".bin")
    res = {}
    for mode in ("compiled", "vm"):
        extra = [prog[p]] if mode == "vm" else []
        r = run([exe, bin_, spp, os.path.join(d, mode + ".rgbf"), os.path.join(d, mode + ".pix"), *extra], timeout=7200)
        res[mode] = json.loads(r.stdout.strip().splitlines()[-1])
    a, b = (open(os.path.join(d, m + ".pix"), "rb").read() for m in ("compiled", "vm"))
    n = len(a) // 4
    same = sum(1 for i in range(n) if a[4 * i:4 * i + 4] == b[4 * i:4 * i + 4])
    ca, cb = res["compiled"], res["vm"]
    return {"target": "host", "arm": sub(arm, sp), "preset": p, "width": ca["width"], "height": ca["height"], "spp": spp,
            "pixelsEqual": same, "pixels": n, "digest0Compiled": ca["digest0"], "digest0Vm": cb["digest0"],
            "meanLumCompiled": ca["meanLuminance"], "meanLumVm": cb["meanLuminance"],
            "secondsCompiled": ca["seconds"], "secondsVm": cb["seconds"]}


# ---- rv32 builds and counts ----
COUNT = os.path.join(work, "rv32imfc-count")


def group(name):
    if re.search(r"vmsec", name): return "adapter"
    if re.match(r"^(cdl_vm_|run$|run\.)", name) or name in ("copy_lobe", "move_words"): return "interpreter"
    if re.search(r"(sec_|mat_\d|sdf_\d|hf_\d|dens_\d|bump[HN]_\d)", name): return "sections"
    return "kernel"


def rv_objs(key, tag, extra):
    arm, sp = key
    d = os.path.join(work, "rv32" + tag, sub(arm, sp))
    os.makedirs(d, exist_ok=True)
    objs = []
    for src in (os.path.join(GEN, "cdl_kernel.cpp"), os.path.join(GEN, "cdl_post.cpp"), os.path.join(CKD, "cdl_vm_sections.cpp")):
        o = os.path.join(d, os.path.basename(src) + ".o")
        run([TC + "g++", *RV, "-O2", *RVCOMMON, *CXX, "-ffunction-sections", "-fdata-sections", *extra, *defines(arm, sp), f"-I{CPU}", f"-I{GEN}", f"-I{VM}", "-c", src, "-o", o])
        objs.append(o)
    o = os.path.join(d, "cdl_vm.o")
    run([TC + "gcc", "-std=c99", *RV, "-O2", *RVCOMMON, "-ffunction-sections", "-fdata-sections", *extra, "-include", os.path.join(CKD, "cdl_vm_ck_math.h"),
         f"-I{VM}", "-c", os.path.join(VM, "cdl_vm.c"), "-o", o])
    return objs + [o]


def rv_one(arm, p, objs, tag, extra):
    sp = spec[p]
    d = os.path.join(work, "rv32" + tag, sub(arm, sp), p)
    os.makedirs(d, exist_ok=True)
    so = os.path.join(d, "scene.o")
    run([TC + "g++", *RV, "-O2", *RVCOMMON, *CXX, "-ffunction-sections", "-fdata-sections", *extra, *defines(arm, sp), f"-I{CPU}", f"-I{GEN}", f"-I{scene_dir[p]}",
         "-c", os.path.join(scene_dir[p], p + ".cpp"), "-o", so])
    s = os.path.join(d, "blobs.S")
    open(s, "w").write(f'.section .rodata\n.global cdl_blob\n.balign 16\ncdl_blob:\n.incbin "{os.path.join(scene_dir[p], p + ".bin")}"\n'
                       f'.global cdl_prog\n.global cdl_prog_end\n.balign 16\ncdl_prog:\n.incbin "{prog[p]}"\ncdl_prog_end:\n')
    meta = json.load(open(os.path.join(scene_dir[p], p + ".json")))
    samples = meta["width"] * meta["height"]
    res = {}
    for mode, use in (("compiled", 0), ("vm", 1)):
        elf = os.path.join(d, mode + ".elf")
        run([TC + "gcc", *RV, "-O2", *RVCOMMON, *extra, f"-DCDL_NS={ns(arm)}", f"-DCDL_SECTIONS={ns(arm)}_sections_{cid(p)}", f"-DCDL_USE_VM={use}", f"-I{CPU}",
             "-nostartfiles", "-static", "-Wl,-Ttext=0x10000", "-Wl,-e,_start", "-Wl,--gc-sections", os.path.join(CKD, "driver.c"), s, so, *objs,
             "-lstdc++", "-lm", "-lc", "-lgcc", "-o", elf])
        prof = os.path.join(d, mode + ".prof.tsv")
        r = subprocess.run([COUNT, elf, os.path.join(d, mode + ".rgbf"), prof], capture_output=True, text=True, timeout=7200)
        if r.returncode:
            raise RuntimeError(f"{arm} {p} {mode}: counter exit {r.returncode}: {r.stderr[-800:]}")
        mark = [json.loads(l) for l in r.stderr.splitlines() if l.startswith("{") and '"mark"' in l][-1]
        digest = next(l.split()[1] for l in r.stderr.splitlines() if l.startswith("digest "))
        groups = {}
        for line in open(prof):
            n, name = line.rstrip("\n").split("\t")
            g = group(name)
            groups[g] = groups.get(g, 0) + int(n)
        res[mode] = {"perSample": round(mark["instructions"] / samples, 1), "digest": digest,
                     "profilePerSample": {g: round(v / samples, 1) for g, v in sorted(groups.items())}}
    c, v = res["compiled"], res["vm"]
    return {"target": "rv32" + tag, "arm": sub(arm, sp), "preset": p, "width": meta["width"], "height": meta["height"], "compiled": c, "vm": v,
            "ratio": round(v["perSample"] / c["perSample"], 4), "digestEqual": c["digest"] == v["digest"]}


with open(out, "a") as f, ThreadPoolExecutor(jobs) as ex:
    def emit(o):
        f.write(json.dumps(o) + "\n"); f.flush()
        if o["target"] == "host":
            print(f'host {o["arm"]} {o["preset"]}: {o["pixelsEqual"]}/{o["pixels"]} pixel digests equal over {o["spp"]} frames; frame-0 digest '
                  f'{o["digest0Compiled"]} / {o["digest0Vm"]}; mean luminance {o["meanLumCompiled"]:.6g} / {o["meanLumVm"]:.6g}', flush=True)
        else:
            print(f'{o["target"]} {o["arm"]} {o["preset"]}: {o["compiled"]["perSample"]} -> {o["vm"]["perSample"]} instructions per sample (x{o["ratio"]}), '
                  f'digests {"equal" if o["digestEqual"] else "differ"}; vm profile {o["vm"]["profilePerSample"]}', flush=True)
    keys = sorted({(a, spec[p]) for a in arms for p in presets})
    objs = dict(zip(keys, ex.map(host_objs, keys)))
    for o in ex.map(lambda ap: host_one(ap[0], ap[1], objs[(ap[0], spec[ap[1]])]), [(a, p) for a in arms for p in presets]):
        emit(o)
    for tag, extra, on in (("", [], "--rv32" in flags), ("-nofma", ["-ffp-contract=off"], "--rv32-nofma" in flags)):
        if not on:
            continue
        run(["gcc", "-O2", "-DCOUNT_MEM_MB=64", "-o", COUNT, os.path.join(HERE, "harness", "rv32imfc-count.c"), "-lm"])
        robjs = dict(zip(keys, ex.map(lambda k: rv_objs(k, tag, extra), keys)))
        for o in ex.map(lambda ap: rv_one(ap[0], ap[1], robjs[(ap[0], spec[ap[1]])], tag, extra), [(a, p) for a in arms for p in presets]):
            emit(o)
