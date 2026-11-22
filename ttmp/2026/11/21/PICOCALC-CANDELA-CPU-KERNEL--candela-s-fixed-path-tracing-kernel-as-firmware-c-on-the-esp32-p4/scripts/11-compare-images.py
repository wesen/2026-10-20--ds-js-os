#!/usr/bin/env python3
"""11-compare-images.py: device 64 spp frames against the host build of the same C++.

usage: python3 -I 11-compare-images.py BENCH.log HOST_FRAMES_DIR OUT_DIR [--arm cpu]

BENCH.log (or BENCH.log.gz) is an image run (CDL_BENCH_MODE 2): per scene a CKIMG header, CKPX rows (base64 of per-pixel
f32 luminance and an RGBE preview), CKIMGEND. HOST_FRAMES_DIR holds 09-host-tests.py frames output
(<arm>-<scene>.rgbf, mean RGB per pixel). For each scene: the device/host mean luminance ratio, the share of
pixels whose luminance is within 1% of the host's, and the mean relative difference. Writes OUT_DIR/
<scene>-device.png (from the RGBE preview), OUT_DIR/compare.json, and a contact sheet of all device frames."""
import base64
import gzip
import json
import math
import struct
import sys
import zlib
from pathlib import Path

log, hostdir, outdir = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
arm = sys.argv[sys.argv.index("--arm") + 1] if "--arm" in sys.argv else "cpu"
outdir.mkdir(parents=True, exist_ok=True)
imgs, cur = {}, None
for raw in (gzip.open(log, "rb") if log.suffix == ".gz" else open(log, "rb")):
    p = raw.decode(errors="replace").strip().split()
    if not p:
        continue
    if p[0] == "CKIMG":
        cur = {"scene": p[1], "w": int(p[2]), "h": int(p[3]), "spp": int(p[4]), "cycles": int(p[5]), "meanLum": float(p[6]), "rows": {}}
        imgs[p[1]] = cur
    elif p[0] == "CKPX" and cur:
        cur["rows"][int(p[1])] = base64.b64decode(p[2])
    elif p[0] == "CKIMGEND":
        cur = None


def png(path, w, h, rgb):
    rows = b"".join(b"\0" + bytes(rgb[y * w * 3:(y + 1) * w * 3]) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def tonemap(lin, lum):
    lit = [v for v in lum if v > 1e-4 * max(lum)] or [1.0]
    k = 0.18 / max(math.exp(sum(math.log(v) for v in lit) / len(lit)), 1e-9)
    out = []
    for v in lin:
        v = v * k
        v = v / (1 + v)
        v = 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        out.append(max(0, min(255, int(v * 255 + 0.5))))
    return out


res, sheet = {}, []
for s, im in imgs.items():
    w, h = im["w"], im["h"]
    if len(im["rows"]) != h:
        res[s] = {"error": f"{len(im['rows'])} of {h} rows received"}
        continue
    dl, lin = [], []
    for y in range(h):
        r = im["rows"][y]
        for x in range(w):
            dl.append(struct.unpack_from("<f", r, 8 * x)[0])
            R, G, B, E = r[8 * x + 4:8 * x + 8]
            f = math.ldexp(1.0, E - 136) if E else 0.0
            lin += [(R + 0.5) * f if E else 0.0, (G + 0.5) * f if E else 0.0, (B + 0.5) * f if E else 0.0]
    hostf = hostdir / f"{arm}-{s}.rgbf"
    hv = struct.unpack(f"<{w * h * 3}f", hostf.read_bytes())
    hl = [0.2126 * hv[3 * i] + 0.7152 * hv[3 * i + 1] + 0.0722 * hv[3 * i + 2] for i in range(w * h)]
    scale = sum(hl) / len(hl)
    rel = [abs(a - b) / max(abs(a), abs(b), 1e-6 * scale) for a, b in zip(dl, hl)]
    res[s] = {"meanLumDevice": sum(dl) / len(dl), "meanLumHost": scale, "ratio": (sum(dl) / len(dl)) / scale,
              "within1pct": sum(1 for v in rel if v <= 0.01) / len(rel), "meanRelDiff": sum(rel) / len(rel),
              "deviceCycles": im["cycles"], "cyclesPerSample": im["cycles"] / (w * h * im["spp"]), "spp": im["spp"]}
    rgb = tonemap(lin, dl)
    png(outdir / f"{s}-device.png", w, h, rgb)
    sheet.append((s, w, h, rgb))
    print(s, json.dumps(res[s]))
(outdir / "compare.json").write_text(json.dumps(res, indent=1) + "\n")
if sheet:   # contact sheet: the device frames side by side
    W = sum(w for _, w, _, _ in sheet) + 4 * (len(sheet) - 1)
    H = max(h for _, _, h, _ in sheet)
    canvas = [255] * (W * H * 3)
    x0 = 0
    for _, w, h, rgb in sheet:
        for y in range(h):
            canvas[3 * (y * W + x0):3 * (y * W + x0 + w)] = rgb[3 * y * w:3 * (y + 1) * w]
        x0 += w + 4
    png(outdir / "device-frames.png", W, H, canvas)
