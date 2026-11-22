#!/usr/bin/env python3
"""08-tonemap-png.py: turn a raw float RGB frame from 05-harness into a viewable PNG, and compare two.

usage: python3 -I 08-tonemap-png.py WIDTH HEIGHT IN.rgbf OUT.png [OTHER.rgbf]

The frame holds scene-referred radiance (Candela's photometric units: a sunlit card is ~10^4 nit).
This is a preview, not Candela's post pass: exposure puts the log-average luminance at 0.18, then
x / (1 + x) and the sRGB transfer curve. With OTHER.rgbf it also prints how far the two frames are
apart (mean absolute relative difference of luminance and the share of pixels within 1 %), which
is how the host and RV32 builds of the same kernel are compared."""
import math
import struct
import sys
import zlib

w, h, src, dst = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]


def load(path):
    data = open(path, "rb").read()
    if len(data) != w * h * 12:
        sys.exit(f"{path}: {len(data)} bytes, expected {w * h * 12}")
    return struct.unpack(f"<{w * h * 3}f", data)


px = load(src)
lum = [0.2126 * px[3 * i] + 0.7152 * px[3 * i + 1] + 0.0722 * px[3 * i + 2] for i in range(w * h)]
logavg = math.exp(sum(math.log(max(v, 1e-6)) for v in lum) / len(lum))
k = 0.18 / max(logavg, 1e-9)


def enc(v):
    v = v * k
    v = v / (1.0 + v)
    v = 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return max(0, min(255, int(v * 255 + 0.5)))


rows = b"".join(b"\0" + bytes(enc(px[3 * (y * w + x) + c]) for x in range(w) for c in range(3)) for y in range(h))
chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")
open(dst, "wb").write(png)
nan = sum(1 for v in px if v != v)
print(f"{src}: log-average luminance {logavg:.4g}, max {max(lum):.4g}, NaN components {nan} -> {dst}")
if len(sys.argv) > 5:
    other = load(sys.argv[5])
    l2 = [0.2126 * other[3 * i] + 0.7152 * other[3 * i + 1] + 0.0722 * other[3 * i + 2] for i in range(w * h)]
    rel = [abs(a - b) / max(abs(a), abs(b), 1e-6 * logavg) for a, b in zip(lum, l2)]
    print(f"vs {sys.argv[5]}: mean relative luminance difference {sum(rel) / len(rel):.4%}, "
          f"pixels within 1 %: {sum(1 for r in rel if r <= 0.01) / len(rel):.2%}, "
          f"mean luminance ratio {sum(l2) / max(sum(lum), 1e-30):.5f}")
