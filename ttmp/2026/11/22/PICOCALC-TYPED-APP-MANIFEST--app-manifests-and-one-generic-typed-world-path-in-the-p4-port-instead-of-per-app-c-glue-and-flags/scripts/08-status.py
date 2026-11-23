#!/usr/bin/env python3
"""The running firmware's state without flashing: wait WAIT seconds, then the worlds, the painter and the I2C0
counters. usage: python3 08-status.py OUT.json [WAIT]"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[6] / "bench/board"))
import device  # noqa: E402

out = Path(sys.argv[1])
with device.acquire(), out.with_suffix(".log").open("wb", buffering=0) as log:
    console = device.Console(device.PORT, log)
    try:
        time.sleep(float(sys.argv[2]) if len(sys.argv) > 2 else 0)
        worlds = console.worlds()
        value = {"worlds": {n: {k: w.get(k) for k in ("engine", "file", "state", "restarts", "last_error")}
                            for n, w in sorted(worlds.items())},
                 "painter": device.painter(console), "buses": console.buses()}
    finally:
        console.close()
device.save(out, value)
print(json.dumps({k: value[k] for k in ("painter", "buses")}))
print({n: (w["engine"], w["file"], w["state"], w["last_error"]) for n, w in value["worlds"].items()
       if n in device.NATIVE})
