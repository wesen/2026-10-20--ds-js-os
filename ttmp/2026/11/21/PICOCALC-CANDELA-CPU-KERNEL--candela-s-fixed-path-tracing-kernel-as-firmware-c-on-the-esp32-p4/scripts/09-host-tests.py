#!/usr/bin/env python3
"""09-host-tests.py: host-side checks of the generated kernel and its CPU substitutions.

usage: python3 -I 09-host-tests.py BUILD_DIR {sky,poison,frames} [--spp 64] [--out FILE]

  sky     07-sky-error.cpp at table sizes 16, 32, 64, 128 on the sky scenes (B-01, L-03): relative error
          of the table lookup against Candela's skyL. One JSON line per size and scene.
  poison  CDL_NO_ZERO_INIT is only correct if no field of an uninitialised struct or array is read before
          it is written. Each check builds an arm twice natively, once zeroing such declarations and once
          filling them with 0xA5 (CDL_POISON_INIT), and requires bit-identical frames. The host has no FMA,
          so the two builds round identically wherever their arithmetic is the same.
  frames  host reference frames at --spp samples per pixel (frame indices 0..spp-1) for the arms the device
          renders and for the exact-math arm, to compare against device frames and to measure what the
          substitutions do to the image. Writes BUILD_DIR/host-frames/<arm>-<scene>.{rgbf,json}.
"""
import argparse
import concurrent.futures as cf
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("build", HERE / "04-build.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)


def sky(build):
    out = build / "sky"
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for n in (16, 32, 64, 128):
        exe = out / f"sky-{n}"
        B.run(["g++", "-O2", "-std=gnu++17", "-fno-math-errno", "-fwrapv", "-w", "-DCDL_NS=cdl_sky", "-DCDL_SKY_TABLE=1", f"-DCDL_SKY_N={n}",
               f"-I{B.CPU}", f"-I{B.GEN}", f"-I{B.GEN / 'scenes'}", str(HERE / "07-sky-error.cpp"), "-o", str(exe)])
        for scene in ("B-01", "L-03"):
            r = json.loads(B.run([str(exe), str(B.GEN / "scenes" / f"{scene}.bin"), "400000"]).stdout)
            r["scene"] = scene
            rows.append(r)
            print(json.dumps(r))
    return rows


def host_exe(build, arm, scene, extra, tag):
    """Native build of one arm (plus extra switches) for one scene; returns the executable."""
    out = build / "host-tests" / tag / scene   # one directory per scene: parallel builds share object names
    out.mkdir(parents=True, exist_ok=True)
    name = B.ns(arm, scene) if B.ARMS[arm]["mode"] == "mono" else B.ns(arm)
    objs = []
    for nm, _, srcs in B.instances(arm, [scene]):
        for src, x in srcs:
            obj = out / f"{nm}-{src.stem}.o"
            B.run(["g++", "-O2", "-fno-math-errno", "-fwrapv", *B.CXX, *B.defines(arm, nm), *x, *extra, f"-I{B.CPU}", f"-I{B.GEN}",
                   f"-I{B.GEN / 'scenes'}", "-c", str(src), "-o", str(obj)])
            objs.append(str(obj))
    sec = ["-DCDL_SECTIONS_NONE=1"] if B.ARMS[arm]["mode"] == "mono" else [f"-DCDL_SECTIONS={B.ns(arm)}_sections_{scene.replace('-', '_')}"]
    exe = out / f"{arm}-{scene}.exe"
    B.run(["gcc", "-O2", f"-DCDL_NS={name}", *sec, f"-I{B.CPU}", str(HERE / "06-driver.c"), *objs, "-lstdc++", "-lm", "-o", str(exe)])
    return exe


def render(exe, scene, spp, rgbf, aov=None):
    cmd = [str(exe), str(B.GEN / "scenes" / f"{scene}.bin"), str(spp), str(rgbf)] + ([str(aov)] if aov else [])
    return json.loads(B.run(cmd, timeout=7200).stdout)


def poison(build, jobs):
    # (arm with NO_ZERO_INIT, poisoned) against (the same switches without NO_ZERO_INIT, zeroed)
    pairs = [("cpu", "cpu-noinit"), ("noinit", "lazy"), ("hash", None)]
    checks = []
    for a, zeroed in pairs:
        for scene in B.SCENES:
            checks.append((a, zeroed, scene))

    def one(c):
        a, zeroed, scene = c
        p = host_exe(build, a, scene, ["-DCDL_POISON_INIT=1"], "poison")
        # the zeroed twin: same switches minus NO_ZERO_INIT
        if zeroed:
            z = host_exe(build, zeroed, scene, [], "zeroed")
        else:
            sw = [s for s in B.ARMS[a]["switches"] if s != "NO_ZERO_INIT"]
            B.ARMS[a + "-zeroed"] = dict(B.ARMS[a], switches=sw)
            z = host_exe(build, a + "-zeroed", scene, [], "zeroed")
        dp = render(p, scene, 1, "/dev/null")["digest0"]
        dz = render(z, scene, 1, "/dev/null")["digest0"]
        return {"arm": a, "scene": scene, "poisoned": dp, "zeroed": dz, "equal": dp == dz}
    rows = list(cf.ThreadPoolExecutor(jobs).map(one, checks))
    for r in rows:
        print(json.dumps(r))
    print(f"poison: {sum(r['equal'] for r in rows)}/{len(rows)} frames bit-identical")
    return rows


def frames(build, spp, jobs, arms):
    out = build / "host-frames"
    out.mkdir(parents=True, exist_ok=True)
    jobsl = [(a, s) for a in arms for s in ("B-01", "R-01", "L-03", "G-01", "E-02", "W-02")]

    def one(j):
        a, s = j
        exe = host_exe(build, a, s, [], "frames")
        r = render(exe, s, spp, out / f"{a}-{s}.rgbf")
        r.update(arm=a, scene=s)
        (out / f"{a}-{s}.json").write_text(json.dumps(r) + "\n")
        return r
    rows = list(cf.ThreadPoolExecutor(jobs).map(one, jobsl))
    for r in rows:
        print(json.dumps(r))
    return rows


def fma(build, spp, jobs):
    """Two host builds of the cpu arm that differ only in FMA contraction, rendered at SPP: per-pixel agreement.
    Explains how far two correct compilations of the same kernel differ per pixel (RV32 contracts a*b+c into
    fmadd.s under -ffp-contract=fast; the reference host build has no FMA)."""
    import struct
    out = build / "host-fma"
    out.mkdir(parents=True, exist_ok=True)

    def one(s):
        rows = {}
        for tag, extra in (("nofma", []), ("fma", ["-mfma", "-ffp-contract=fast"])):
            exe = host_exe(build, "cpu", s, extra, "fma-" + tag)
            render(exe, s, spp, out / f"{tag}-{s}.rgbf")
            v = struct.unpack(f"<{(out / f'{tag}-{s}.rgbf').stat().st_size // 4}f", (out / f"{tag}-{s}.rgbf").read_bytes())
            rows[tag] = [0.2126 * v[i] + 0.7152 * v[i + 1] + 0.0722 * v[i + 2] for i in range(0, len(v), 3)]
        a, b = rows["fma"], rows["nofma"]
        m = sum(b) / len(b)
        rel = [abs(x - y) / max(abs(x), abs(y), 1e-6 * m) for x, y in zip(a, b)]
        return {"scene": s, "spp": spp, "ratio": (sum(a) / len(a)) / m, "within1pct": sum(r <= 0.01 for r in rel) / len(rel),
                "meanRelDiff": sum(rel) / len(rel), "identical": a == b}
    rows = list(cf.ThreadPoolExecutor(jobs).map(one, ["B-01", "R-01", "L-03", "G-01", "E-02"]))
    for r in rows:
        print(json.dumps(r))
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("build", type=Path)
    ap.add_argument("test", choices=["sky", "poison", "frames", "fma"])
    ap.add_argument("--spp", type=int, default=64)
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--arms", default="cpu,lazy,hash,proto")
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    build = a.build.resolve()
    rows = (sky(build) if a.test == "sky" else poison(build, a.jobs) if a.test == "poison" else fma(build, a.spp, a.jobs) if a.test == "fma"
            else frames(build, a.spp, a.jobs, a.arms.split(",")))
    if a.out:
        a.out.write_text("".join(json.dumps(r) + "\n" for r in rows))
    if a.test == "poison" and not all(r["equal"] for r in rows):
        sys.exit(1)


if __name__ == "__main__":
    main()
