#!/usr/bin/env python3
"""15-device-vs-frames.py: per-pixel luminance of a device image run against any set of host frames.

usage: python3 -I 15-device-vs-frames.py BENCH.log[.gz] FRAMES_DIR PREFIX

Compares each CKIMG frame's f32 luminance with FRAMES_DIR/<PREFIX><scene>.rgbf (mean RGB per pixel), e.g. the
host builds with and without FMA contraction from 09-host-tests.py fma (prefix "fma-" or "nofma-"). Prints, per
scene, the fraction of pixels equal to 1e-6, within 1e-4 and within 1%, and the largest relative difference."""
import base64
import gzip
import struct
import sys
from pathlib import Path

import numpy as np

log, fdir, prefix = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
imgs, cur = {}, None
for raw in (gzip.open(log, "rb") if log.suffix == ".gz" else open(log, "rb")):
    p = raw.decode(errors="replace").split()
    if not p:
        continue
    if p[0] == "CKIMG":
        cur = imgs.setdefault(p[1], {"w": int(p[2]), "h": int(p[3]), "rows": {}})
    elif p[0] == "CKPX" and cur is not None:
        cur["rows"][int(p[1])] = base64.b64decode(p[2])
    elif p[0] == "CKIMGEND":
        cur = None
for s, im in imgs.items():
    f = fdir / f"{prefix}{s}.rgbf"
    if not f.exists():
        continue
    w, h = im["w"], im["h"]
    dev = np.array([struct.unpack_from("<f", im["rows"][y], 8 * x)[0] for y in range(h) for x in range(w)])
    rgb = np.fromfile(f, dtype="<f4").reshape(-1, 3).astype(np.float64)
    host = rgb @ np.array([0.2126, 0.7152, 0.0722])
    rel = np.abs(dev - host) / np.maximum(np.maximum(np.abs(dev), np.abs(host)), 1e-6 * host.mean())
    print(f"{s}: rel<=1e-6 {np.mean(rel <= 1e-6):.4f}  rel<=1e-4 {np.mean(rel <= 1e-4):.4f}  rel<=1% {np.mean(rel <= 0.01):.4f}  max {rel.max():.3g}")
