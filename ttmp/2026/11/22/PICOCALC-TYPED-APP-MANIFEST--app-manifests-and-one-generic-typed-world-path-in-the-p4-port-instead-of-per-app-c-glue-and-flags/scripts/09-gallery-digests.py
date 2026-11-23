#!/usr/bin/env python3
"""The Candela gallery's 18 scene digests against the RV32 reference, without waiting for the gallery to be drawing
on screen (bench/board/gallery.py's first check, which needs the gallery in front). Used while the keyboard's I2C
fails on every transfer and its errors flood the console. Optionally writes BUILD's app first.

usage: python3 09-gallery-digests.py OUT [--build BUILD]
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[6] / "bench/board"))
import device  # noqa: E402
import gallery  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("out", type=Path)
ap.add_argument("--build", type=Path)
a = ap.parse_args()
reference = {r["id"]: r for r in map(json.loads, gallery.REFERENCE.read_text().splitlines())}
a.out.mkdir(parents=True, exist_ok=False)
rec = gallery.Records(a.out / "cgal.jsonl")
result = {"scenes": {}}
with device.acquire(), (a.out / "uart.log").open("wb", buffering=0) as log:
    if a.build:
        device.check_build(a.build)
        device.hold(device.Console(device.PORT, log))
        device.write_app(a.build, a.out, "experiment")
        result["build"] = str(a.build)
    console = device.Console(device.PORT, log)
    try:
        time.sleep(20)   # the boot compiles
        rec.step = "list"
        gallery.command(console, rec, "gallery list", timeout=30)
        ids = list(dict.fromkeys(r["id"] for r in map(json.loads, (a.out / "cgal.jsonl").read_text().splitlines())
                                 if r.get("ev") == "scene-list"))
        assert sorted(ids) == sorted(reference), (ids, sorted(reference))
        for sid in ids:
            rec.step = f"digest-{sid}"
            gallery.command(console, rec, f"gallery digest {sid} 4 psram", timeout=30)
            r = gallery.wait_for(console, rec, lambda r: r.get("ev") in ("digest", "error"), 600)
            ref = reference[sid]
            same = r is not None and r.get("ev") == "digest" and all(r[k] == ref[k] for k in ("frame0", "acc", "disp"))
            result["scenes"][sid] = {"same": same, "device": r, "rv32": {k: ref[k] for k in ("frame0", "acc", "disp")}}
            print(f"{sid}: {'same' if same else 'DIFFERS'}", flush=True)
    finally:
        console.close()
result["allSame"] = len(result["scenes"]) == len(reference) and all(s["same"] for s in result["scenes"].values())
device.save(a.out / "gallery.json", result)
print(f"{sum(s['same'] for s in result['scenes'].values())}/{len(reference)} scenes agree with the RV32 reference")
sys.exit(0 if result["allSame"] else 1)
