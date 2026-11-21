import argparse
from pathlib import Path
from board_common import (
    acquire,
    PLAYABLE,
    PLAYABLE_SHA,
    check_build,
    health,
    release,
    save,
)

p = argparse.ArgumentParser()
p.add_argument("out", type=Path)
p.add_argument("--previous", type=Path, default=PLAYABLE)
p.add_argument("--port", default="/dev/ttyACM0")
a = p.parse_args()
check_build(a.previous, PLAYABLE_SHA)
a.out.mkdir(parents=True, exist_ok=False)
with acquire(), (a.out / "uart.log").open("wb", buffering=0) as log:
    c = release.unit.Console(a.port, log)
    release.hold(c)
    release.esp("verify_flash", a.previous, a.out, "before", a.port)
    c = release.unit.Console(a.port, log)
    try:
        save(
            a.out / "preflight.json",
            {
                "appSHA256": PLAYABLE_SHA,
                "partitionSHA256": release.PART_SHA,
                "bothFlashRegionsVerified": True,
                "health": health(c),
            },
        )
    finally:
        c.close()
