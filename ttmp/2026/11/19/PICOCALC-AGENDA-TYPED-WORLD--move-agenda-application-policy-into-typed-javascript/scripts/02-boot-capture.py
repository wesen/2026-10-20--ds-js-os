#!/usr/bin/env python3
"""Reset the PicoCalc and record its boot with host timestamps. Under the board lock (bench/board/device.py).

usage (repository root): python3 ttmp/.../scripts/02-boot-capture.py OUT [--resets N] [--build DIR]

With --build, DIR's app is written first (an experiment image); without, the playable image that the main
checkout's firmware/PLAYABLE.json records is the one on the board. Each boot sends `trace on` every half second
for its first 15 s (the console queue is the kernel's, so polling `worlds` would delay the boot it measures), then
reads `worlds` once at 30 s. With the kernel's trace on, every dispatched message is logged with the kernel's
clock. A world's frames reach its subscribers as "frames" messages, so the first "W <- frames from agenda" line
is Agenda's first frame, which it publishes only once its first read of notes/todo.txt has settled.

OUT/boot-N.log holds each boot's UART bytes with "@<seconds since the port opened after reset>" per line;
OUT/boots.json the compile rows (`NAME compile ... us=`), the first frame of Agenda, Files, Editor and Chess (host
and kernel time) and the worlds' engines and files.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import serial

REPO = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(REPO / "bench/board"))
import device  # noqa: E402

MAIN_PLAYABLE = Path("/home/manuel/code/wesen/2026-10-20--ds-js-os/firmware/PLAYABLE.json")
COMPILE = re.compile(r"(\S+) compile source=(\S+) status=(\S+) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)")
WATCH = ("agenda", "files", "editor", "chess")


FRAME = re.compile(r"\[\s*([\d.]+)\] (\S+) <- frames from (\S+) (.*)$")


def capture(port, out, index, seconds=32):
    rows, first, worlds = [], {}, None
    log = (out / f"boot-{index}.log").open("wb")
    s = serial.Serial(port, 115200, timeout=.02)
    t0 = time.monotonic()
    pending, last_trace, asked = b"", -1.0, False
    try:
        while time.monotonic() - t0 < seconds:
            chunk = s.read(max(1, s.in_waiting))
            now = time.monotonic() - t0
            pending += chunk
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                text = line.rstrip(b"\r").decode(errors="replace")
                log.write(f"@{now:.3f} ".encode() + line + b"\n")
                m = COMPILE.search(text)
                if m:
                    rows.append({"name": m[1], "status": m[3], "us": int(m[4]), "moduleBytes": int(m[6]), "at": now})
                m = FRAME.search(text)
                if m and m[3] in WATCH and m[3] not in first:
                    first[m[3]] = {"host": now, "kernelMs": float(m[1]), "to": m[2], "json": m[4][:80]}
                if text.startswith('[{"name":'):
                    try:
                        worlds = {w["name"]: {k: w.get(k) for k in ("engine", "file", "state", "turns", "restarts",
                                                                     "last_error")} for w in json.loads(text)}
                    except ValueError:
                        pass
            if now < 15 and now - last_trace > .5:
                s.write(b"\ntrace on\n")
                last_trace = now
            if now > 30 and not asked:
                s.write(b"\ntrace off\nworlds\n")
                asked = True
    finally:
        s.close()
        log.close()
    return {"compiles": rows, "firstFrames": first, "worlds": worlds}


def hold(port, path, timeout=90):
    """device.hold over the raw port: pause the Candela gallery, then hold storage. (device.Console's deadline is
    checked only while no line is pending, so the gallery's CGAL records keep a timed-out command waiting.)"""
    with path.open("wb", buffering=0) as log, serial.Serial(port, 115200, timeout=.05) as s:
        deadline = time.monotonic() + timeout
        buf, asked = b"", 0.0
        while time.monotonic() < deadline:
            if time.monotonic() - asked > 8:
                s.write(b"\ngallery pause\nhold\n")
                asked = time.monotonic()
            chunk = s.read(4096)
            log.write(chunk)
            buf = (buf + chunk)[-4096:]
            if b"held between transactions" in buf:
                return
        raise TimeoutError("the board did not hold")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("--resets", type=int, default=3)
    ap.add_argument("--build", type=Path)
    ap.add_argument("--port", default=device.PORT)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    if a.build:
        build, digest = a.build, device.check_build(a.build)
    else:
        record = json.loads(MAIN_PLAYABLE.read_text())
        digest = record["app"]["sha256"]
        build = Path.home() / ".cache/picocalc/firmware" / digest
        device.check_build(build, digest)
    boots = []
    with device.acquire():
        hold(a.port, a.out / "hold.log")
        if a.build:
            device.esp("write_flash", build, a.out, "experiment-write", a.port)
        for i in range(a.resets):
            device.esp("verify_flash", build, a.out, f"reset-{i}", a.port)   # verifies, then hard-resets
            boots.append(capture(a.port, a.out, i))
            print(json.dumps({k: boots[-1][k] for k in ("compiles", "firstFrames")}), flush=True)
            if i + 1 < a.resets:
                hold(a.port, a.out / f"hold-{i}.log")
    device.save(a.out / "boots.json", {"build": str(build), "sha256": digest, "boots": boots})


if __name__ == "__main__":
    main()
