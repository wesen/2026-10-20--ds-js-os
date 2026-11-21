import argparse
import time
from pathlib import Path
from common import acquire, ready, save, unit
from workflows import edit, key, play

p = argparse.ArgumentParser()
p.add_argument("out", type=Path)
p.add_argument("--port", default="/dev/ttyACM0")
p.add_argument("--blocks", type=int, default=3)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=False)
with acquire(), (a.out / "uart.log").open("wb", buffering=0) as log:
    c = unit.Console(a.port, log)
    try:
        ready(c)
        c.input_ready()
        time.sleep(2)
        rows = play(c, a.out, a.blocks)
        save(a.out / "editor.json", edit(c, a.out))
        key(c, "f1")
        worlds, p = ready(c)
        c.input_ready()
        save(
            a.out / "final.json",
            {
                "worlds": sorted(set(worlds) & unit.NATIVE.keys()),
                "painter": p,
                "qualified": True,
            },
        )
    finally:
        c.close()
