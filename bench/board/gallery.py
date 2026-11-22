#!/usr/bin/env python3
"""Check the Candela gallery on the installed playable firmware: it is drawing, and every scene's digests agree with
the RV32 reference build.

usage: python3 bench/board/gallery.py OUT [--passes 4] [--port PORT]

Under the board lock, on the firmware already running (install it first with playable.py): read CGAL records until the
gallery reports a scene (it draws on its own after boot, so it is in front), capture the screen, list the scenes, and
for each run "gallery digest ID PASSES psram". The frame-0, accumulation and display digests must equal
bench/reference/candela-gallery/rv32-4-passes.jsonl, which PICOCALC-CANDELA-GALLERY's 04-build-ref.py wrote from the
same kernel compiled for rv32emu. Writes OUT/{uart.log,cgal.jsonl,gallery.json,boot.png}.
Promoted from PICOCALC-CANDELA-GALLERY scripts/06-run-device.py (digests and the screen capture only).
"""
import argparse
import base64
import json
import re
import struct
import sys
import time
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import device  # noqa: E402

REFERENCE = HERE.parent / "reference/candela-gallery/rv32-4-passes.jsonl"
RLE = re.compile(rb"[A-Za-z0-9+/=]+")


class Records:
    """CGAL records from the console, each kept with the step that produced it."""

    def __init__(self, path):
        self.f = path.open("a")
        self.step = "boot"

    def take(self, raw):
        if raw.startswith("CGAL {"):
            rec = json.loads(raw[5:])
            self.f.write(json.dumps({"step": self.step, "hostTime": round(time.time(), 3), **rec}) + "\n")
            self.f.flush()
            return rec
        return None


def command(console, rec, line, timeout=10):
    out = console.command(line, timeout=timeout)
    for raw in out:
        rec.take(raw)
    return out


def wait_for(console, rec, until, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            raw = console.line(deadline).decode(errors="replace")
        except TimeoutError:
            return None
        r = rec.take(raw)
        if r is not None and until(r):
            return r
    return None


def png(path, w, h, rgb565):
    rows = b"".join(b"\0" + bytes(c for x in range(w) for c in (
        ((p := rgb565[2 * (y * w + x)] | rgb565[2 * (y * w + x) + 1] << 8) >> 11 & 31) * 255 // 31,
        (p >> 5 & 63) * 255 // 63, (p & 31) * 255 // 31)) for y in range(h))
    chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def shot(console, rec, out, timeout=180):
    """The compositor's framebuffer over the console ("shot": RLE of RGB565, base64 lines), with the gallery paused."""
    command(console, rec, "gallery pause")
    console.send("shot")
    deadline = time.monotonic() + timeout
    data, size, end, ack = [], None, None, False
    while not (end and ack):
        line = console.line(deadline)
        if rec.take(line.decode(errors="replace")) is not None:
            continue
        if line == b"#OK shot":
            ack = True
        elif line.startswith(b"#SHOT "):
            size = tuple(map(int, line.split()[1:]))
        elif line.startswith(b"#END "):
            end = line.split()
        elif size and not end and RLE.fullmatch(line.strip()):
            data.append(line.strip())
    command(console, rec, "gallery resume")
    w, h = size
    pixels = bytearray()
    for run, color in struct.iter_unpack("<HH", base64.b64decode(b"".join(data), validate=True)):
        pixels.extend(struct.pack("<H", color) * run)
    crc = zlib.crc32(pixels)
    if len(pixels) != w * h * 2 or crc != int(end[1], 16):
        raise ValueError("invalid framebuffer RLE or CRC")
    png(out / "boot.png", w, h, pixels)
    return {"width": w, "height": h, "crc32": f"{crc:08x}"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("--passes", type=int, default=4)
    ap.add_argument("--port", default=device.PORT)
    a = ap.parse_args()
    assert a.passes == 4, "the reference holds 4-pass digests"
    reference = {r["id"]: r for r in map(json.loads, REFERENCE.read_text().splitlines())}
    a.out.mkdir(parents=True, exist_ok=False)
    rec = Records(a.out / "cgal.jsonl")
    result = {"reference": str(REFERENCE.relative_to(HERE.parents[1])), "scenes": {}}
    with device.acquire(), (a.out / "uart.log").open("wb", buffering=0) as log:
        console = device.Console(a.port, log)
        try:
            drawing = wait_for(console, rec, lambda r: r.get("ev") in ("scene", "pass", "first"), 120)
            assert drawing, "no CGAL scene record within 120 s: the gallery is not drawing"
            result["drawing"] = drawing
            result["shot"] = shot(console, rec, a.out)
            rec.step = "list"
            command(console, rec, "gallery list")
            ids = list(dict.fromkeys(r["id"] for r in map(json.loads, (a.out / "cgal.jsonl").read_text().splitlines())
                                     if r.get("ev") == "scene-list"))
            assert sorted(ids) == sorted(reference), (ids, sorted(reference))
            for sid in ids:
                rec.step = f"digest-{sid}"
                command(console, rec, f"gallery digest {sid} {a.passes} psram")
                r = wait_for(console, rec, lambda r: r.get("ev") in ("digest", "error"), 600)
                ref = reference[sid]
                same = r is not None and r.get("ev") == "digest" and all(r[k] == ref[k] for k in ("frame0", "acc", "disp"))
                result["scenes"][sid] = {"same": same, "device": r, "rv32": {k: ref[k] for k in ("frame0", "acc", "disp")}}
                print(f"{sid}: {'same' if same else 'DIFFERS'} frame0 {r and r.get('frame0')} acc {r and r.get('acc')}", flush=True)
        finally:
            console.close()
    result["allSame"] = all(s["same"] for s in result["scenes"].values()) and len(result["scenes"]) == len(reference)
    device.save(a.out / "gallery.json", result)
    print(f"{sum(s['same'] for s in result['scenes'].values())}/{len(reference)} scenes agree with the RV32 reference")
    return 0 if result["allSame"] else 1


if __name__ == "__main__":
    sys.exit(main())
