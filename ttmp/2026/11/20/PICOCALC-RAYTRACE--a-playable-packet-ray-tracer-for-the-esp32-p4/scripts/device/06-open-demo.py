"""Return a qualified board to the default Ray Tracer screen for the player."""

import argparse
import json
import time
from pathlib import Path

from board_common import acquire, health, release, save

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("run", type=Path)
p.add_argument("--port", default="/dev/ttyACM0")
a = p.parse_args()
with acquire(), (a.run / "opening-handoff-serial.log").open("wb", buffering=0) as log:
    result = json.loads((a.run / "final.json").read_bytes())
    assert result["qualified"] and result["verifiedFinalAppAndPartition"]
    expected = json.loads((a.run / "screens.json").read_bytes())[0]
    c = release.unit.Console(a.port, log)
    try:
        health(c)
        for key in ("f1", "v", "r"):
            c.command("key " + key)
            time.sleep(0.35)
        deadline = time.monotonic() + 20
        while True:
            shot = c.shot("opening-handoff", a.run)
            if shot["appSha256"] == expected["framebuffer"]["appSha256"]:
                break
            if time.monotonic() > deadline:
                raise RuntimeError("initial Ray Tracer body did not settle")
        state = c.health()["raytrace"]
        assert not state["last_error"] and state["restarts"] == 0
        save(
            a.run / "handoff.json",
            {
                "appSHA256": result["appSHA256"],
                "visible": "Ray Tracer",
                "state": state["state"],
                "engine": state["engine"],
                "bodySha256": shot["appSha256"],
                "scene": expected["scene"],
                "qualifiedOpeningConfirmed": True,
            },
        )
    finally:
        c.close()
