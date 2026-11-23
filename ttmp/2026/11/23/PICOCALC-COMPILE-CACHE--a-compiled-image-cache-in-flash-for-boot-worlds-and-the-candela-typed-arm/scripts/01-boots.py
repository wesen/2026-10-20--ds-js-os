#!/usr/bin/env python3
"""Boots of an experiment image with the compiled-module cache, under the board lock (bench/board/device.py).

usage (repository root): python3 ttmp/.../scripts/01-boots.py OUT --build DIR STEP...

Steps, run in order:
  flash            hold the running firmware, then write DIR's app (the next reset boots it)
  boot:TAG         reset (esptool verify_flash, which resets) and capture the boot with host timestamps, sending
                   `trace on` every 0.5 s for the first 15 s as PICOCALC-AGENDA-TYPED-WORLD's 02-boot-capture.py did
                   (the first "W <- frames from APP" line is APP's first frame), until every cache miss has its
                   "cache stored" line (the writer runs after the boot) or 120 s
  cmd:TEXT         a console command on the running firmware (TEXT's underscores become spaces), its lines kept
  health:TAG       reset, then device.health with peripherals on (the playable firmware's judgement)

OUT/steps.jsonl gets one record per step; OUT/<step>.log the UART bytes with "@<seconds>" per line.
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

COMPILE = re.compile(r"(\S+) compile source=(\S+) status=(\S+) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)(?: sha=(\w+))?")
HIT = re.compile(r"(\S+) cache hit us=(\d+) key_us=(\d+) read_us=(\d+) module_bytes=(\d+) sha=(\w+) seq=(\d+) saved_us=(\d+)")
MISS = re.compile(r"(\S+) cache (miss|corrupt|unread \(no memory\)) key_us=(\d+) read_us=(\d+)(?:: (.*))?$")
STORED = re.compile(r"(\S+) cache stored seq=(\d+) module_bytes=(\d+) us=(\d+) prepare_us=(\d+) write_us=(\d+) "
                    r"commit_us=(\d+) free_kb=(\d+)")
NOT_STORED = re.compile(r"(\S+) cache not stored: (.*)$")
FRAME = re.compile(r"\[\s*([\d.]+)\] (\S+) <- frames from (\S+)")
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


def capture(port, path, least=40, most=120):
    rec = {"compiles": [], "hits": [], "misses": [], "stored": [], "notStored": [], "firstFrames": {}, "panic": None}
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
                                        "moduleBytes": int(m[5]), "sha": m[6], "seq": int(m[7]), "savedUs": int(m[8]), "at": now})
                elif m := MISS.search(text):
                    rec["misses"].append({"name": m[1], "kind": m[2], "keyUs": int(m[3]), "readUs": int(m[4]), "why": m[5], "at": now})
                elif m := STORED.search(text):
                    rec["stored"].append({"name": m[1], "seq": int(m[2]), "moduleBytes": int(m[3]), "us": int(m[4]),
                                          "prepareUs": int(m[5]), "writeUs": int(m[6]), "commitUs": int(m[7]),
                                          "freeKb": int(m[8]), "at": now})
                elif m := NOT_STORED.search(text):
                    rec["notStored"].append({"name": m[1], "why": m[2], "at": now})
                elif (m := FRAME.search(text)) and m[3] in WATCH and m[3] not in rec["firstFrames"]:
                    rec["firstFrames"][m[3]] = {"host": now, "kernelS": float(m[1]), "to": m[2]}
                if "Guru Meditation" in text or "assert failed" in text or "abort()" in text:
                    rec["panic"] = text
            if now < 15 and now - last_trace > .5:
                s.write(b"\ntrace on\n")
                last_trace = now
            elif 15 <= now and last_trace < 15:
                s.write(b"\ntrace off\n")
                last_trace = now
            compiled = [c for c in rec["compiles"] if c["status"] == "ok"]
            settled = len(rec["stored"]) + len(rec["notStored"]) >= len(compiled)
            if done_at is None and now > 20 and settled and len(rec["firstFrames"]) == len(WATCH):
                done_at = now
    finally:
        s.close()
        log.close()
    return rec


def command(port, path, text, timeout=180):
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
            tag = f"{i:02d}-{kind}-{arg.replace('/', '_').replace(' ', '_')}"[:60]
            t = time.time()
            if kind == "flash":
                hold(a.port, a.out / f"{tag}-hold.log")
                device.esp("write_flash", a.build, a.out, tag, a.port)
                rec = {"sha256": digest}
            elif kind == "boot":
                hold(a.port, a.out / f"{tag}-hold.log")
                device.esp("verify_flash", a.build, a.out, tag + "-reset", a.port)   # verifies, then hard-resets
                rec = capture(a.port, a.out / f"{tag}.log")
            elif kind == "cmd":
                rec = {"lines": command(a.port, a.out / f"{tag}.log", arg.replace("_", " "))}
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
            brief = {k: rec[k] for k in ("step", "compiles", "hits", "misses", "stored", "notStored", "firstFrames", "panic")
                     if k in rec}
            print(json.dumps(brief) if kind == "boot" else json.dumps(rec)[:3000], flush=True)
            if kind == "boot" and rec["panic"]:
                raise SystemExit(f"panic during {step}: {rec['panic']}")


if __name__ == "__main__":
    main()
