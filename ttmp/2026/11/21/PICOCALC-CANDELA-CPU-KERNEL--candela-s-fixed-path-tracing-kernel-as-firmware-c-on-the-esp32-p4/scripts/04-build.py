#!/usr/bin/env python3
"""04-build.py: build every measurement arm of the generated Candela kernel.

usage: python3 -I 04-build.py BUILD_DIR {rv32,host,count,board,all} [--jobs N] [--arms a,b] [--scenes A-01,...]

BUILD_DIR must be outside the repository (a scratchpad directory). Targets:
  rv32   per arm: cdl_kernel.cpp, cdl_post.cpp and each scene's sections compiled for rv32imafc/ilp32f with
         the IDF 5.4.2 toolchain into BUILD_DIR/rv32/lib<arm>.a, then one bare-metal ELF per arm and scene
         (06-driver.c) for the counting interpreter. The same libraries are linked into the board app.
  host   the same arms compiled natively: BUILD_DIR/host/<arm>-<scene>.exe (06-driver.c, host mode).
  count  run 05-rv32imfc-count on every ELF: BUILD_DIR/counts.jsonl (instructions per frame, by class,
         inside the counted row regions; frame digest; .text bytes of the arm's library).
  board  write BUILD_DIR/board/{registry.c,blobs.S,libcdl.a,arms.json} for scripts/board (07-stage-board.sh).
An arm is a set of switches (cpu/cdl_switches.h) plus an optimisation level and a placement; see ARMS.
"""
import argparse
import concurrent.futures as cf
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
GEN, CPU = HERE / "generated", HERE / "cpu"
TC = Path("/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin")
RVCXX, RVCC, RVAR, RVOBJCOPY, RVSIZE = (str(TC / f"riscv32-esp-elf-{t}") for t in ("g++", "gcc", "ar", "objcopy", "size"))
RV = ["-march=rv32imafc_zicsr_zifencei", "-mabi=ilp32f"]
COMMON = ["-fno-math-errno", "-fwrapv", "-msmall-data-limit=0", "-mno-relax"]
CXX = ["-std=gnu++17", "-fno-exceptions", "-fno-rtti", "-fno-threadsafe-statics", "-w"]
SKY_N = 64
SCENES = {"B-01": (160, 160), "R-01": (160, 160), "L-03": (160, 160), "G-01": (160, 160), "E-02": (160, 160), "W-02": (80, 80)}

SW = ["LAZY_SELECT", "NO_ZERO_INIT", "FAST_FLOOR", "FAST_TRIG", "FAST_EXP", "INT_HASH", "SKY_TABLE", "POW32"]
LADDER = [("wgsl", []), ("lazy", ["LAZY_SELECT"]), ("noinit", ["NO_ZERO_INIT"]), ("floor", ["FAST_FLOOR"]),
          ("trig", ["FAST_TRIG"]), ("exp", ["FAST_EXP"]), ("hash", ["INT_HASH"]), ("cpu", ["SKY_TABLE", "POW32"])]
ARMS = {}
acc = []
for name, add in LADDER:
    acc = acc + add
    ARMS[name] = {"switches": list(acc), "opt": "-O2", "mode": "table", "place": "flash", "group": "ladder"}
for sw, tag in [("LAZY_SELECT", "lazy"), ("NO_ZERO_INIT", "noinit"), ("FAST_FLOOR", "floor"), ("FAST_TRIG", "trig"),
                ("FAST_EXP", "exp"), ("INT_HASH", "hash")]:
    ARMS[f"cpu-{tag}"] = {"switches": [s for s in SW if s != sw], "opt": "-O2", "mode": "table", "place": "flash", "group": "leave-one-out"}
ARMS["cpu-O3"] = dict(ARMS["cpu"], opt="-O3", group="variant")
ARMS["cpu-iram"] = dict(ARMS["cpu"], place="iram", group="variant")
ARMS["mono"] = dict(ARMS["cpu"], mode="mono", group="variant")
ARMS["proto"] = {"switches": ["LAZY_SELECT"], "opt": "-O2", "mode": "mono", "place": "flash", "group": "variant"}


def ns(arm, scene=None):
    base = "cdl_" + arm.replace("-", "_")
    return base + "_" + scene.replace("-", "_") if scene else base


def defines(arm, name):
    a = ARMS[arm]
    return [f"-DCDL_NS={name}", f"-DCDL_SKY_N={SKY_N}"] + [f"-DCDL_{s}=1" for s in a["switches"]]


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        raise RuntimeError(f"{' '.join(map(str, cmd))}\n{r.stdout}{r.stderr}")
    return r


def instances(arm, scenes):
    """(namespace, scene or None, sources) for one arm: one instance, or one per scene in mono mode."""
    if ARMS[arm]["mode"] == "mono":
        return [(ns(arm, s), s, [(GEN / "cdl_kernel.cpp", [f'-DCDL_MONO=1', f'-DCDL_MONO_SCENE="scenes/{s}.inc"'])]) for s in scenes]
    srcs = [(GEN / "cdl_kernel.cpp", []), (GEN / "cdl_post.cpp", [])] + [(GEN / "scenes" / f"{s}.cpp", []) for s in scenes]
    return [(ns(arm), None, srcs)]


def compile_arm(arm, out, scenes, host):
    a = ARMS[arm]
    objs = []
    for name, _, srcs in instances(arm, scenes):
        for src, extra in srcs:
            obj = out / f"{name}-{src.stem}{'' if src.parent == GEN else '-sec'}.o"
            if host:
                cmd = ["g++", "-O2", "-fno-math-errno", "-fwrapv", *CXX, *defines(arm, name), *extra, f"-I{CPU}", f"-I{GEN}", f"-I{GEN / 'scenes'}", "-c", str(src), "-o", str(obj)]
            else:
                sections = [] if a["place"] == "iram" else ["-ffunction-sections", "-fdata-sections"]
                cmd = [RVCXX, *RV, a["opt"], *COMMON, *CXX, *sections, *defines(arm, name), *extra, f"-I{CPU}", f"-I{GEN}", f"-I{GEN / 'scenes'}", "-c", str(src), "-o", str(obj)]
            run(cmd)
            if not host and a["place"] == "iram":
                run([RVOBJCOPY, "--rename-section", ".text=.iram1.cdl", str(obj)])
            objs.append(obj)
    lib = out / f"lib{arm}.a"
    lib.unlink(missing_ok=True)   # a stale archive could keep members of an earlier build
    run([("ar" if host else RVAR), "rcs", str(lib), *map(str, objs)])
    return arm, lib, objs


def blob_asm(path, scene):
    path.write_text(f'.section .rodata\n.global cdl_blob\n.balign 16\ncdl_blob:\n.incbin "{GEN / "scenes" / (scene + ".bin")}"\n')


def link_elf(arm, scene, lib, out):
    name = ns(arm, scene) if ARMS[arm]["mode"] == "mono" else ns(arm)
    sec = ["-DCDL_SECTIONS_NONE=1"] if ARMS[arm]["mode"] == "mono" else [f"-DCDL_SECTIONS={ns(arm)}_sections_{scene.replace('-', '_')}"]
    blob = out / f"blob-{scene}.S"
    if not blob.exists():
        blob_asm(blob, scene)
    elf = out / f"{arm}-{scene}.elf"
    run([RVCC, *RV, "-O2", *COMMON, f"-DCDL_NS={name}", *sec, f"-I{CPU}", "-nostartfiles", "-static", "-Wl,-Ttext=0x10000",
         "-Wl,-e,_start", "-Wl,--gc-sections", str(HERE / "06-driver.c"), str(blob), str(lib), "-lm", "-lc", "-lgcc", "-o", str(elf)])
    return elf


def link_host(arm, scene, lib, out):
    name = ns(arm, scene) if ARMS[arm]["mode"] == "mono" else ns(arm)
    sec = ["-DCDL_SECTIONS_NONE=1"] if ARMS[arm]["mode"] == "mono" else [f"-DCDL_SECTIONS={ns(arm)}_sections_{scene.replace('-', '_')}"]
    exe = out / f"{arm}-{scene}.exe"
    run(["gcc", "-O2", f"-DCDL_NS={name}", *sec, f"-I{CPU}", str(HERE / "06-driver.c"), str(lib), "-lstdc++", "-lm", "-o", str(exe)])
    return exe


def text_bytes(objs):
    r = run([RVSIZE, "-A", *map(str, objs)])
    total = {"text": 0, "iram": 0, "rodata": 0, "data": 0, "bss": 0}
    for line in r.stdout.splitlines():
        p = line.split()
        if len(p) >= 2 and p[1].isdigit():
            n, sec = int(p[1]), p[0]
            if sec.startswith(".text"):
                total["text"] += n
            elif sec.startswith(".iram1"):
                total["iram"] += n
            elif sec.startswith((".rodata", ".srodata")):
                total["rodata"] += n
            elif sec.startswith((".data", ".sdata")):
                total["data"] += n
            elif sec.startswith((".bss", ".sbss")):
                total["bss"] += n
    return total


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("build", type=Path)
    ap.add_argument("target", choices=["rv32", "host", "count", "board", "all"])
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--arms")
    ap.add_argument("--scenes")
    a = ap.parse_args()
    build = a.build.resolve()
    if HERE.parents[4] in build.parents:
        sys.exit("BUILD_DIR must be outside the repository")
    arms = a.arms.split(",") if a.arms else list(ARMS)
    scenes = a.scenes.split(",") if a.scenes else list(SCENES)
    targets = ["rv32", "count", "board", "host"] if a.target == "all" else [a.target]
    pool = cf.ThreadPoolExecutor(a.jobs)
    for t in targets:
        if t in ("rv32", "host"):
            out = build / t
            out.mkdir(parents=True, exist_ok=True)
            libs = {arm: (lib, objs) for arm, lib, objs in pool.map(lambda arm: compile_arm(arm, out, scenes, t == "host"), arms)}
            link = link_elf if t == "rv32" else link_host
            jobs = [(arm, s) for arm in arms for s in scenes]
            list(pool.map(lambda j: link(j[0], j[1], libs[j[0]][0], out), jobs))
            if t == "rv32":
                sizes = {arm: text_bytes(objs) for arm, (lib, objs) in libs.items()}
                (out / "sizes.json").write_text(json.dumps(sizes, indent=1) + "\n")
            print(f"{t}: {len(arms)} arms, {len(jobs)} programs -> {out}")
        elif t == "count":
            count = build / "rv32imfc-count"
            run(["gcc", "-O2", "-o", str(count), str(HERE / "05-rv32imfc-count.c"), "-lm"])
            out = build / "rv32"
            sizes = json.loads((out / "sizes.json").read_text())

            def one(j):
                arm, s = j
                elf = out / f"{arm}-{s}.elf"
                r = subprocess.run([str(count), str(elf), str(out / f"{arm}-{s}.rgbf"), str(out / f"{arm}-{s}.prof.tsv")],
                                   capture_output=True, text=True, timeout=3600)
                if r.returncode:
                    return {"arm": arm, "scene": s, "error": r.stderr[-400:]}
                mark = next(json.loads(l) for l in r.stderr.splitlines() if l.startswith('{"mark"'))
                digest = next(l.split()[1] for l in r.stderr.splitlines() if l.startswith("digest "))
                W, H = SCENES[s]
                return {"arm": arm, "scene": s, "width": W, "height": H, "digest": digest, "frameInstructions": mark["instructions"],
                        "perSample": mark["instructions"] / (W * H), "classesPerSample": {k: v / (W * H) for k, v in mark.items() if k not in ("mark", "instructions")},
                        "armBytes": sizes[arm]}
            rows = list(pool.map(one, [(arm, s) for arm in arms for s in scenes]))
            with (build / "counts.jsonl").open("w") as f:
                for r in rows:
                    f.write(json.dumps(r) + "\n")
            bad = [r for r in rows if "error" in r]
            print(f"count: {len(rows) - len(bad)} programs counted, {len(bad)} failed -> {build / 'counts.jsonl'}")
            for r in bad:
                print("  FAILED", r["arm"], r["scene"], r["error"].strip().splitlines()[-1:])
        elif t == "board":
            out = build / "board"
            out.mkdir(parents=True, exist_ok=True)
            libdir = build / "rv32"
            objs = []
            for arm in arms:
                objs += sorted(str(p) for p in libdir.glob(f"{ns(arm)}*.o")) if ARMS[arm]["mode"] == "table" else \
                    sorted(str(p) for s in scenes for p in libdir.glob(f"{ns(arm, s)}-*.o"))
            lib = out / "libcdl.a"
            lib.unlink(missing_ok=True)
            run([RVAR, "rcs", str(lib), *objs])
            reg = ['#include "registry.h"']
            for arm in arms:
                if ARMS[arm]["mode"] == "table":
                    reg.append(f"CDL_DECLARE_INSTANCE({ns(arm)})")
                    reg += [f"extern const char {ns(arm)}_sections_{s.replace('-', '_')}[];" for s in scenes]
                else:
                    reg += [f"int {ns(arm, s)}_bind(const cdl_buffers *, const void *, void *); unsigned {ns(arm, s)}_sky_bytes(void); "
                            f"void {ns(arm, s)}_render_span(int, int, int, unsigned, cdl_pixout *);" for s in scenes]
            reg += [f"extern const unsigned char cdl_blob_{s.replace('-', '_')}[], cdl_blob_{s.replace('-', '_')}_end[];" for s in scenes]
            reg.append("const cdl_scene_t CDL_SCENES[] = {")
            reg += [f'  {{"{s}", cdl_blob_{s.replace("-", "_")}, cdl_blob_{s.replace("-", "_")}_end, {SCENES[s][0]}, {SCENES[s][1]}}},' for s in scenes]
            reg.append("};\nconst int CDL_NSCENES = %d;\nconst cdl_arm_t CDL_ARMS[] = {" % len(scenes))
            for k, arm in enumerate(arms):
                for j, s in enumerate(scenes):
                    n = ns(arm, s) if ARMS[arm]["mode"] == "mono" else ns(arm)
                    sec = "0" if ARMS[arm]["mode"] == "mono" else f"{ns(arm)}_sections_{s.replace('-', '_')}"
                    post = (f"{n}_post_bind, {n}_display_px, {n}_denoise_px") if ARMS[arm]["mode"] == "table" else "0, 0, 0"
                    reg.append(f'  {{"{arm}", {k}, {j}, {n}_bind, {n}_sky_bytes, {n}_render_span, {sec}, {post}}},')
            reg.append("};\nconst int CDL_NARMS = %d;\nconst char *const CDL_ARM_NAMES[] = {%s};\nconst int CDL_NARM_NAMES = %d;\n"
                       % (len(arms) * len(scenes), ", ".join(f'"{x}"' for x in arms), len(arms)))
            (out / "registry.c").write_text("\n".join(reg) + "\n")
            (out / "blobs.S").write_text("".join(
                f'.section .rodata\n.global cdl_blob_{s.replace("-", "_")}\n.global cdl_blob_{s.replace("-", "_")}_end\n.balign 16\n'
                f'cdl_blob_{s.replace("-", "_")}:\n.incbin "{GEN / "scenes" / (s + ".bin")}"\ncdl_blob_{s.replace("-", "_")}_end:\n' for s in scenes))
            (out / "arms.json").write_text(json.dumps({"arms": {k: ARMS[k] for k in arms}, "scenes": {s: SCENES[s] for s in scenes}, "skyN": SKY_N}, indent=1) + "\n")
            print(f"board: {len(objs)} objects, registry of {len(arms) * len(scenes)} instances -> {out}")


if __name__ == "__main__":
    main()
