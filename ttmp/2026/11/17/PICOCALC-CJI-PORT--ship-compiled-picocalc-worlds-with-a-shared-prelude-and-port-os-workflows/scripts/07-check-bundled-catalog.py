"""Run each system.json JavaScript world through the physical firmware compiler.

From the repository root, redirect stdout to a JSON-lines receipt. Progress goes
to stderr. With names as positional arguments, rerun just those worlds.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import time

import serial


def check(port, file, source, timeout):
    expected = hashlib.sha256(source).hexdigest()
    port.reset_input_buffer()
    port.write(f"\ncji check {file}\n".encode())
    refusal = None
    reserved_bytes = None
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        line = port.readline().decode(errors="replace").strip()
        if line.startswith(("cji: begin ", "cji: relocated ", "cji: released ", "cji: assembled ", "cji: compiler refused ")):
            print(line, file=sys.stderr, flush=True)
        if line.startswith("cji: busy"):
            time.sleep(2)
            port.write(f"\ncji check {file}\n".encode())
            continue
        if "Guru Meditation" in line or "assert failed:" in line or "Rebooting..." in line:
            time.sleep(15)
            return {"result": "device fault", "diagnostic": line}
        if line.startswith(("cji: bundled JS", "cji: cannot allocate", "unknown command cji")):
            raise RuntimeError(line)
        if line.startswith("cji: frontend reserved_bytes="):
            reserved_bytes = int(line.split("=")[1])
            continue
        if line.startswith("cji: allocation refused "):
            fields = dict(pair.split("=", 1) for pair in line.split()[3:])
            refusal = {key: value if key == "reason" else int(value) for key, value in fields.items()}
            continue
        match = re.search(r"cji: check (ok|failed) elapsed_ms=(\d+) scratch_peak=(\d+) source_sha256=([0-9a-f]{64}) (.*)", line)
        if not match:
            continue
        status, ms, peak, received, detail = match.groups()
        if received != expected:
            raise RuntimeError(f"{file}: unexpected source SHA-256 {received}")
        row = {"result": status, "elapsed_ms": int(ms), "scratch_bytes": int(peak), "source_sha256": received}
        if reserved_bytes is not None:
            row["frontend_reserved_bytes"] = reserved_bytes
        if refusal is not None:
            row["allocation_refusal"] = refusal
        if status == "ok":
            size, sha = re.fullmatch(r"bytes=(\d+) sha256=([0-9a-f]{64})", detail).groups()
            row.update(elf_bytes=int(size), elf_sha256=sha)
        else:
            row["diagnostic"] = detail.removeprefix("error=")
        return row
    raise TimeoutError(f"no terminal receipt for {file}")


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", default="/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00")
parser.add_argument("--timeout", type=int, default=1200, help="seconds to wait per world")
parser.add_argument("names", nargs="*")
args = parser.parse_args()
root = Path("picocalc-os/js")
worlds = json.loads((root / "system.json").read_text())["worlds"]
with serial.Serial(args.port, 115200, timeout=.25) as connection:
    for world in worlds:
        if args.names and world["name"] not in args.names:
            continue
        file = world["file"]
        source = (root / file).read_bytes()
        print(f"Checking {file}", file=sys.stderr, flush=True)
        row = {"world": world["name"], "file": file, "source_bytes": len(source)}
        row.update(check(connection, file, source, args.timeout))
        print(json.dumps(row), flush=True)
