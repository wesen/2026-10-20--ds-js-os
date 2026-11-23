#!/usr/bin/env python3
"""Boots of an experiment image with the compiled-module cache, under the board lock (bench/board/device.py).

usage (repository root): python3 ttmp/.../scripts/01-boots.py OUT --build DIR STEP...

Steps, run in order:
  flash            hold the running firmware, then write DIR's app (the next reset boots it)
  boot:TAG[:S]     reset (esptool verify_flash, which resets) and capture the boot with host timestamps, sending
                   `trace on` every 0.5 s for the first 15 s as PICOCALC-AGENDA-TYPED-WORLD's 02-boot-capture.py did
                   (the first "W <- frames from APP" line is APP's first frame), until every cache miss has its
                   "cache stored" line (the writer runs after the boot) or 120 s; with S, for at least S seconds.
                   The gallery's records (CGAL) are kept too: its Typed program loads after the boot.
  watch:TAG:S      capture S seconds of the running firmware without resetting it
  shot:TAG         the screen, without pausing the gallery (its caption names the kernel), as TAG.png
  cmd:TEXT         a console command on the running firmware (TEXT's underscores become spaces), its lines kept
  health:TAG       reset, then device.health with peripherals on (the playable firmware's judgement)

OUT/steps.jsonl gets one record per step; OUT/<step>.log the UART bytes with "@<seconds>" per line.
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

import serial

REPO = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(REPO / "bench/board"))
import device  # noqa: E402
import gallery  # noqa: E402

COMPILE = re.compile(r"(\S+) compile source=(\S+) status=(\S+) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)(?: sha=(\w+))?")
HIT = re.compile(r"(\S+) cache hit us=(\d+) key_us=(\d+) read_us=(\d+) module_bytes=(\d+) sha=(\w+) seq=(\d+) saved_us=(\d+)")
MISS = re.compile(r"(\S+) cache (miss|corrupt|unread \(no memory\)) key_us=(\d+) read_us=(\d+)(?:: (.*))?$")
STORED = re.compile(r"(\S+) cache stored seq=(\d+) module_bytes=(\d+) us=(\d+) prepare_us=(\d+) write_us=(\d+) "
                    r"commit_us=(\d+) free_kb=(\d+)")
NOT_STORED = re.compile(r"(\S+) cache not stored: (.*)$")
FRAME = re.compile(r"\[\s*([\d.]+)\] (\S+) <- frames from (\S+)")
RECORD = re.compile(r"^(TCACHE|TCVERIFY) (\{.*\})")
WATCH = ("agenda", "files", "editor", "chess")


def hold(port, path, timeout=90):
    """device.hold over the raw port (the gallery's records can keep device.Console waiting): pause, then hold."""
    with path.open("wb", buffering=0) as log, serial.Serial(port, 115200, timeout=.05) as s:
        deadline = time.monotonic() + timeout
        buf, asked = b"", 0.0
        while time.monotonic() < deadline:
            if time.monotonic() - asked > 14:
                s.write(b"\ngallery pause\nhold\n")
                asked = time.monotonic()
            chunk = s.read(4096)
            log.write(chunk)
            buf = (buf + chunk)[-4096:]
            if b"held between transactions" in buf:
                return
        raise TimeoutError("the board did not hold")


def capture(port, path, least=40, most=120, trace=True):
    rec = {"compiles": [], "hits": [], "misses": [], "stored": [], "notStored": [], "firstFrames": {}, "cgal": [],
           "panic": None}
    log = path.open("wb")
    s = serial.Serial(port, 115200, timeout=.02)
    t0 = time.monotonic()
    pending, last_trace, done_at = b"", -1.0, None
    try:
        while True:
            now = time.monotonic() - t0
            if now > most or (done_at is not None and now > max(least, done_at + 2)):
                break
            chunk = s.read(max(1, s.in_waiting))
            pending += chunk
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                text = line.rstrip(b"\r").decode(errors="replace")
                log.write(f"@{now:.3f} ".encode() + line + b"\n")
                if m := COMPILE.search(text):
                    rec["compiles"].append({"name": m[1], "source": m[2], "status": m[3], "us": int(m[4]),
                                            "peakJsBytes": int(m[5]), "moduleBytes": int(m[6]), "sha": m[7], "at": now})
                elif m := HIT.search(text):
                    rec["hits"].append({"name": m[1], "us": int(m[2]), "keyUs": int(m[3]), "readUs": int(m[4]),
                                        "moduleBytes": int(m[5]), "sha": m[6], "seq": int(m[7]), "savedUs": int(m[8]),
                                        "at": now})
                elif m := MISS.search(text):
                    rec["misses"].append({"name": m[1], "kind": m[2], "keyUs": int(m[3]), "readUs": int(m[4]),
                                          "why": m[5], "at": now})
                elif m := STORED.search(text):
                    rec["stored"].append({"name": m[1], "seq": int(m[2]), "moduleBytes": int(m[3]), "us": int(m[4]),
                                          "prepareUs": int(m[5]), "writeUs": int(m[6]), "commitUs": int(m[7]),
                                          "freeKb": int(m[8]), "at": now})
                elif m := NOT_STORED.search(text):
                    rec["notStored"].append({"name": m[1], "why": m[2], "at": now})
                elif (m := FRAME.search(text)) and m[3] in WATCH and m[3] not in rec["firstFrames"]:
                    rec["firstFrames"][m[3]] = {"host": now, "kernelS": float(m[1]), "to": m[2]}
                if text.startswith("CGAL {") and '"ev":"pass"' not in text:
                    try:
                        rec["cgal"].append({"at": now, **json.loads(text[5:])})
                    except ValueError:
                        pass
                if "Guru Meditation" in text or "assert failed" in text or "abort()" in text:
                    rec["panic"] = text
            if trace and now < 15 and now - last_trace > .5:
                s.write(b"\ntrace on\n")
                last_trace = now
            elif trace and 15 <= now and last_trace < 15:
                s.write(b"\ntrace off\n")
                last_trace = now
            compiled = [c for c in rec["compiles"] if c["status"] == "ok"]
            settled = len(rec["stored"]) + len(rec["notStored"]) >= len(compiled)
            if done_at is None and now > 20 and settled and (len(rec["firstFrames"]) == len(WATCH) or not trace):
                done_at = now
    finally:
        s.close()
        log.close()
    return rec


def shot(port, path, timeout=180):
    """The compositor's framebuffer over the console (bench/board/gallery.py's decoding, without its pause)."""
    with path.with_suffix(".log").open("ab", buffering=0) as log:
        console = device.Console(port, log)
        try:
            console.send("shot")
            deadline = time.monotonic() + timeout
            data, size, end, ack = [], None, None, False
            while not (end and ack):
                line = console.line(deadline)
                if line.endswith(b"#OK shot"):
                    ack = True
                elif line.startswith(b"#SHOT "):
                    size = tuple(map(int, line.split()[1:]))
                elif line.startswith(b"#END "):
                    end = line.split()
                elif size and not end and gallery.RLE.fullmatch(line.strip()):
                    data.append(line.strip())
        finally:
            console.close()
    w, h = size
    pixels = bytearray()
    for run, color in struct.iter_unpack("<HH", base64.b64decode(b"".join(data), validate=True)):
        pixels.extend(struct.pack("<H", color) * run)
    crc = zlib.crc32(pixels)
    assert len(pixels) == w * h * 2 and crc == int(end[1], 16), "invalid framebuffer RLE or CRC"
    gallery.png(path, w, h, pixels)
    return {"png": str(path), "width": w, "height": h, "crc32": f"{crc:08x}"}


def command(port, path, text, timeout=300):
    with path.open("ab", buffering=0) as log:
        console = device.Console(port, log)
        try:
            return console.command(text, timeout=timeout)
        finally:
            console.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("--build", type=Path, required=True)
    ap.add_argument("--port", default=device.PORT)
    ap.add_argument("steps", nargs="+")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    digest = device.check_build(a.build)
    records = a.out / "steps.jsonl"
    with device.acquire():
        for i, step in enumerate(a.steps):
            kind, _, arg = step.partition(":")
            tag = f"{i:02d}-{kind}-{arg.replace('/', '_').replace(' ', '_').replace(':', '-')}"[:60]
            t = time.time()
            if kind == "flash":
                hold(a.port, a.out / f"{tag}-hold.log")
                device.esp("write_flash", a.build, a.out, tag, a.port)
                rec = {"sha256": digest}
            elif kind == "boot":
                _, _, seconds = arg.partition(":")
                hold(a.port, a.out / f"{tag}-hold.log")
                device.esp("verify_flash", a.build, a.out, tag + "-reset", a.port)   # verifies, then hard-resets
                least = float(seconds) if seconds else 40
                rec = capture(a.port, a.out / f"{tag}.log", least=least, most=max(120, least + 5))
            elif kind == "watch":
                _, _, seconds = arg.partition(":")
                rec = capture(a.port, a.out / f"{tag}.log", least=float(seconds), most=float(seconds) + 1, trace=False)
            elif kind == "shot":
                rec = shot(a.port, a.out / f"{tag}.png")
            elif kind == "cmd":
                lines = command(a.port, a.out / f"{tag}.log", arg.replace("_", " "))
                rec = {"lines": lines,
                       "records": [{"kind": m[1], **json.loads(m[2])} for m in map(RECORD.match, lines) if m]}
            elif kind == "health":
                hold(a.port, a.out / f"{tag}-hold.log")
                device.esp("verify_flash", a.build, a.out, tag + "-reset", a.port)
                with (a.out / f"{tag}.log").open("wb", buffering=0) as log:
                    console = device.Console(a.port, log)
                    try:
                        rec = {"health": device.health(console, "on")}
                    finally:
                        console.close()
            else:
                raise SystemExit(f"unknown step {step}")
            rec = {"step": step, "tag": tag, "hostTime": round(t, 1), **rec}
            with records.open("a") as f:
                f.write(json.dumps(rec) + "\n")
            if kind in ("boot", "watch"):
                brief = {k: rec[k] for k in ("step", "compiles", "hits", "misses", "stored", "notStored", "firstFrames",
                                             "panic")}
                brief["cgal"] = [c for c in rec["cgal"] if c.get("ev") in ("typed-load", "scene", "error", "first")]
                print(json.dumps(brief), flush=True)
                if rec["panic"]:
                    raise SystemExit(f"panic during {step}: {rec['panic']}")
            else:
                print(json.dumps(rec)[:3000], flush=True)


if __name__ == "__main__":
    main()
