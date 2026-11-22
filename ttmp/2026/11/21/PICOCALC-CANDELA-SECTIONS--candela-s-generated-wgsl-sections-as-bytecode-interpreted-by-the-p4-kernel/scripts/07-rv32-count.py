#!/usr/bin/env python3
"""07-rv32-count.py: RV32 instructions per camera sample, compiled sections against interpreted sections (design Section 9).

usage: python3 -I 07-rv32-count.py EXPORT_DIR WORK_DIR OUT.jsonl [--opt -O2] [--spp 1] [--jobs 3] [--extra FLAG] [--vm DIR] PRESET ...

For each preset of EXPORT_DIR (01-export-sections.mjs; its scene.bin fixes the frame size) and each mode, compiled
(MODE=0) and interpreted (MODE=1):
  * PICOCALC-CANDELA-P4's 04-wgsl2cpp.mjs translates the whole program; harness/rewrite-kernel.py wraps the dispatch;
  * the ESP-IDF GCC 14.2 builds harness.cpp and vm/cdl_vm.c for rv32imafc/ilp32f (the firmware's multilib) with the
    scene and the bytecode linked in by .incbin;
  * harness/rv32imfc-count.c executes the ELF and counts the frame between region marks (system call 500), and writes a
    per-function profile.
The interpreter's share comes from the profile: functions named cdl_vm_* or run (cdl_vm.c), and the C adapters that
the bytecode's CALLs go through (adapt::*). One JSON line per preset and mode."""
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
P4 = os.path.join(HERE, "..", "..", "PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4", "scripts")
GCC = "/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-"
args = sys.argv[1:]
opt, spp, jobs, extra = "-O2", 1, 3, []
VMDIR = os.path.join(HERE, "vm")   # --vm DIR: another interpreter (cdl_vm.c, cdl_vm.h, cdl_vm_isa.h), e.g. an earlier revision
while True:
    if "--opt" in args: i = args.index("--opt"); opt = args[i + 1]; del args[i:i + 2]; continue
    if "--spp" in args: i = args.index("--spp"); spp = int(args[i + 1]); del args[i:i + 2]; continue
    if "--jobs" in args: i = args.index("--jobs"); jobs = int(args[i + 1]); del args[i:i + 2]; continue
    if "--extra" in args: i = args.index("--extra"); extra.append(args[i + 1]); del args[i:i + 2]; continue
    if "--vm" in args: i = args.index("--vm"); VMDIR = os.path.abspath(args[i + 1]); del args[i:i + 2]; continue
    break
export, work, out, presets = args[0], args[1], args[2], args[3:]
os.makedirs(work, exist_ok=True)
COUNT = os.path.join(work, "rv32imfc-count")
FLAGS = ["-march=rv32imafc_zicsr_zifencei", "-mabi=ilp32f", opt, "-fno-math-errno", "-fno-exceptions", "-fno-rtti", "-fno-threadsafe-statics", "-w",
         "-msmall-data-limit=0", "-mno-relax", *extra]
LINK = ["-nostartfiles", "-static", "-Wl,-Ttext=0x10000", "-Wl,-e,_start"]


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        raise RuntimeError(f"failed ({r.returncode}): {' '.join(cmd)[:300]}\n{(r.stderr or r.stdout)[-1500:]}")
    return r


run(["gcc", "-O2", "-o", COUNT, os.path.join(HERE, "harness", "rv32imfc-count.c"), "-lm"])
vm_obj = os.path.join(work, f"cdl_vm{opt}-{abs(hash(VMDIR)) % 100000}.o")
run([GCC + "gcc", "-std=c99", *[f for f in FLAGS if f not in ("-fno-exceptions", "-fno-rtti", "-fno-threadsafe-statics")], "-c", os.path.join(VMDIR, "cdl_vm.c"), "-o", vm_obj])
tag = (opt + "".join(extra)).replace("=", "").replace(" ", "")


def group(name):
    if re.match(r"^(cdl_vm_|run$|run\.)", name): return "interpreter"
    if "adapt" in name: return "adapters"
    return "kernel"


def one(job):
    p, mode = job
    d = os.path.join(export, p)
    w = os.path.join(work, p)
    os.makedirs(w, exist_ok=True)
    k = os.path.join(w, "kernel-rw.cpp")
    s = os.path.join(w, f"data-{mode}.S")
    open(s, "w").write(f'.section .rodata\n.global cdl_scene\n.balign 16\ncdl_scene:\n.incbin "{os.path.join(d, "scene.bin")}"\n'
                       f'.global cdl_prog\n.global cdl_prog_end\n.balign 16\ncdl_prog:\n.incbin "{os.path.join(d, "prog.cdvm")}"\ncdl_prog_end:\n')
    elf = os.path.join(w, f"rv32-m{mode}-s{spp}{tag}.elf")
    run([GCC + "g++", *FLAGS, *LINK, f"-DMODE={mode}", f"-DSPP={spp}", f'-DKERNEL="{k}"', "-I", VMDIR,
         os.path.join(HERE, "harness", "harness.cpp"), s, vm_obj, "-o", elf, "-lm", "-lc", "-lgcc"])
    prof = elf.replace(".elf", ".prof.tsv")
    r = subprocess.run([COUNT, elf, elf.replace(".elf", ".rgbf"), prof], capture_output=True, text=True, timeout=7200)
    if r.returncode:
        raise RuntimeError(f"{p} mode {mode}: counter exit {r.returncode}: {r.stderr[-800:]}{r.stdout[-400:]}")
    mark = [json.loads(l) for l in r.stderr.splitlines() if l.startswith("{") and '"mark"' in l]
    if not mark:
        raise RuntimeError(f"{p} mode {mode}: no region mark in counter output: {r.stderr[-500:]}")
    m = mark[-1]
    scene = open(os.path.join(d, "meta.json")).read()
    meta = json.loads(scene)
    samples = meta["width"] * meta["height"] * spp
    groups = {}
    for line in open(prof):
        n, name = line.rstrip("\n").split("\t")
        g = group(re.sub(r"^_ZN\d*\w*?L?\d+", "", name) if False else name)
        groups[g] = groups.get(g, 0) + int(n)
    size = run([GCC + "size", "-A", elf]).stdout
    text = int(next(l.split()[1] for l in size.splitlines() if l.startswith(".text")))
    return {"preset": p, "mode": "vm" if mode else "compiled", "opt": opt, "extra": extra, "width": meta["width"], "height": meta["height"], "spp": spp,
            "frameInstructions": m["instructions"], "perSample": round(m["instructions"] / samples, 1),
            "classesPerSample": {k2: round(v / samples, 1) for k2, v in m.items() if k2 not in ("mark", "instructions") and v},
            "profilePerSample": {g: round(v / samples, 1) for g, v in groups.items()}, "textBytes": text}


def prepare(p):
    d, w = os.path.join(export, p), os.path.join(work, p)
    os.makedirs(w, exist_ok=True)
    run(["node", os.path.join(P4, "04-wgsl2cpp.mjs"), os.path.join(d, "kernel.wgsl"), os.path.join(w, "kernel.cpp")])
    run(["python3", "-I", os.path.join(HERE, "harness", "rewrite-kernel.py"), os.path.join(w, "kernel.cpp"), os.path.join(w, "kernel-rw.cpp")])


for p in presets:
    prepare(p)
jobsList = [(p, m) for p in presets for m in (0, 1)]
with ThreadPoolExecutor(jobs) as ex, open(out, "a") as f:
    for res in ex.map(lambda j: (j, one(j)), jobsList):
        (p, m), o = res
        f.write(json.dumps(o) + "\n"); f.flush()
        print(f'{p} {o["mode"]}: {o["perSample"]} instructions per sample ({o["profilePerSample"]})', flush=True)
