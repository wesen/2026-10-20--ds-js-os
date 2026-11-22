#!/usr/bin/env python3
"""03-agree.py: the per-evaluation agreement test (design Section 8) over exported presets.

usage: python3 -I 03-agree.py EXPORT_DIR WORK_DIR OUT.jsonl [--spp N] [--jobs J] [PRESET ...]

For each preset with an exported program (01-export-sections.mjs) and a bytecode blob (02-translate-all.mjs):
  1. PICOCALC-CANDELA-P4's 04-wgsl2cpp.mjs translates the whole program (kernel.wgsl) to C++;
  2. harness/rewrite-kernel.py renames the five dispatch functions so the harness can wrap them;
  3. harness/harness.cpp is built natively in compare mode (MODE=2) with vm/cdl_vm.c and renders the exported frame
     at SPP samples per pixel; every evaluation of every dispatch function runs compiled and interpreted, and the
     interpreted result is compared with the compiled one.
One JSON line per preset and entry goes to OUT.jsonl; a preset whose prototype translation does not build is
recorded with the build error (that is a limit of the prototype, not of the section translator)."""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
P4 = os.path.join(HERE, "..", "..", "PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4", "scripts")
args = sys.argv[1:]
spp, jobs = 1, 4
if "--spp" in args: i = args.index("--spp"); spp = int(args[i + 1]); del args[i:i + 2]
if "--jobs" in args: i = args.index("--jobs"); jobs = int(args[i + 1]); del args[i:i + 2]
export, work, out = args[0], args[1], args[2]
only = args[3:]
os.makedirs(work, exist_ok=True)


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


vm_obj = os.path.join(work, "cdl_vm.o")
r = run(["gcc", "-std=c99", "-O2", "-fno-math-errno", "-Wall", "-Wextra", "-Wno-unused-const-variable", "-c", os.path.join(HERE, "vm", "cdl_vm.c"), "-o", vm_obj])
if r.returncode:
    sys.exit("cdl_vm.c does not build:\n" + r.stderr)
if r.stderr.strip():
    print(r.stderr, file=sys.stderr)


def one(pid):
    d = os.path.join(export, pid)
    w = os.path.join(work, pid)
    os.makedirs(w, exist_ok=True)
    prog = os.path.join(d, "prog.cdvm")
    if not os.path.exists(prog):
        return [{"preset": pid, "status": "no bytecode"}]
    r = run(["node", os.path.join(P4, "04-wgsl2cpp.mjs"), os.path.join(d, "kernel.wgsl"), os.path.join(w, "kernel.cpp")])
    if r.returncode:
        return [{"preset": pid, "status": "prototype translation failed", "error": r.stderr.strip().splitlines()[-1:]}]
    r = run(["python3", "-I", os.path.join(HERE, "harness", "rewrite-kernel.py"), os.path.join(w, "kernel.cpp"), os.path.join(w, "kernel-rw.cpp")])
    if r.returncode:
        return [{"preset": pid, "status": "rewrite failed", "error": r.stderr.strip()}]
    exe = os.path.join(w, f"compare-s{spp}.exe")
    r = run(["g++", "-std=c++17", "-O2", "-fno-math-errno", "-w", f"-DMODE=2", f"-DSPP={spp}", f'-DKERNEL="{os.path.join(w, "kernel-rw.cpp")}"',
             "-I", os.path.join(HERE, "vm"), os.path.join(HERE, "harness", "harness.cpp"), vm_obj, "-o", exe, "-lm"])
    if r.returncode:
        return [{"preset": pid, "status": "harness build failed", "error": r.stderr.strip().splitlines()[:6]}]
    stats = os.path.join(w, f"compare-s{spp}.jsonl")
    r = run([exe, os.path.join(d, "scene.bin"), prog, os.path.join(w, f"compare-s{spp}.rgbf"), stats], timeout=3600)
    if r.returncode:
        return [{"preset": pid, "status": "run failed", "code": r.returncode, "error": (r.stderr or r.stdout).strip().splitlines()[-3:]}]
    rows = []
    for line in open(stats):
        o = json.loads(line)
        o = {"preset": pid, "status": "ok", "spp": spp, **o}
        rows.append(o)
    return rows


ids = sorted(p for p in os.listdir(export) if os.path.isdir(os.path.join(export, p)) and (not only or p in only))
with ThreadPoolExecutor(jobs) as ex, open(out, "w") as f:
    for rows in ex.map(one, ids):
        for o in rows:
            f.write(json.dumps(o) + "\n")
            if o["status"] != "ok":
                print(o["preset"], o["status"], o.get("error", ""), flush=True)
            elif o["evaluations"]:
                print(f'{o["preset"]} {o["entry"]}: {o["evaluations"]} evaluations, {o["bitExact"]} bit-exact, {o["over1e-5"]} over 1e-5, max rel {o["maxRel"]:.3g}', flush=True)
