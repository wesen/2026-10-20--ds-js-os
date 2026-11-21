import argparse
from pathlib import Path
from common import (
    APP,
    PART,
    PART_SHA,
    RELEASE,
    RELEASE_SHA,
    acquire,
    cold,
    esp,
    hold,
    ready,
    save,
    sha,
    unit,
)

p = argparse.ArgumentParser()
p.add_argument("out", type=Path)
p.add_argument("--port", default="/dev/ttyACM0")
a = p.parse_args()
assert sha(RELEASE / APP) == RELEASE_SHA and sha(RELEASE / PART) == PART_SHA
a.out.mkdir(parents=True, exist_ok=False)
r = {"application": RELEASE_SHA, "partition": PART_SHA, "cold": []}
with acquire(), (a.out / "uart.log").open("wb", buffering=0) as log:
    c = unit.Console(a.port, log)
    hold(c)
    esp("verify_flash", RELEASE, a.out, "baseline-before", a.port)
    r["preflightVerified"] = True
    save(a.out / "cold.json", r)
    c = unit.Console(a.port, log)
    try:
        ready(c)
        c.input_ready()
        for i in range(3):
            r["cold"].append(cold(c))
            save(a.out / "cold.json", r)
            print("completed cold boot", i + 1, flush=True)
    finally:
        c.close()
