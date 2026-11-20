"""Read ordinary gameplay readiness without sending key events or resetting the board."""
import argparse
import fcntl
import json
from pathlib import Path
import re
import time

import serial

LOCK = Path("/tmp/pico-lab2-wave/original/serial.lock")
EXPECTED = {"agenda", "chess", "compositor", "display", "editor", "files", "keyboard", "snake"}
BUS = re.compile(r"bus (\S+)\s+busy\s+([\d.]+) ms, (\d+) transfers, (\d+) bytes, (\d+) errors")


def observe(port):
    with LOCK.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        connection = serial.Serial(baudrate=115200, timeout=.1)
        connection.port = port
        with connection as uart:
            nacks = 0

            def query(name):
                nonlocal nacks
                uart.write(f"\n{name}\n".encode())
                lines = []
                deadline = time.monotonic() + 18
                while time.monotonic() < deadline:
                    line = uart.readline().decode(errors="replace").strip()
                    nacks += "I2C transaction unexpected nack detected" in line
                    if line == f"#OK {name}":
                        return lines
                    if line:
                        lines.append(line)
                raise TimeoutError(f"ordinary app did not acknowledge {name}")

            worlds = next(json.loads(l) for l in query("worlds") if l.startswith('[{"name":'))
            active = {w["name"]: {k:w[k] for k in ("file", "engine", "state", "last_error", "restarts")}
                      for w in worlds if w["name"] in EXPECTED}
            painter = next(json.loads(l) for l in query("painter") if l.startswith('{"sources"'))

            def i2c0():
                for line in query("stats"):
                    match = BUS.search(line)
                    if match and match[1] == "i2c0":
                        return dict(zip(("busyMs", "transfers", "bytes", "errors"),
                                        (float(match[2]), *(int(v) for v in match.groups()[2:]))))
                raise ValueError("i2c0 stats were missing")

            before = i2c0()
            time.sleep(.8)
            after = i2c0()
            ready = after["transfers"] > before["transfers"] and after["errors"] == before["errors"]
            return {"worlds": active, "painter": painter, "i2c0Before": before, "i2c0After": after,
                    "uartNacksSeen": nacks, "keypadPollsClean": ready,
                    "ordinaryReady": active.keys() == EXPECTED and all(
                        w["engine"] == "native" and not w["last_error"] and not w["restarts"]
                        for w in active.values()) and painter["installed"] and not painter["rejects"],
                    "observedActions": ["worlds", "painter", "stats", "stats"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--port", default="/dev/ttyACM0")
    args = parser.parse_args()
    try:
        evidence = observe(args.port)
    except (serial.SerialException, TimeoutError) as error:
        evidence = {"unavailable": str(error)}
    args.receipt.write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence))
