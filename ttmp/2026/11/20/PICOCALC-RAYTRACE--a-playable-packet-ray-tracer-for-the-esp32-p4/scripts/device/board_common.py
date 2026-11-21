"""Share the normal-release flash and console primitives across board trials."""

import importlib.util
import json
from pathlib import Path

TICKET = Path(__file__).resolve().parents[2]
REPO = next(p for p in TICKET.parents if (p / ".git").exists())
previous = next(TICKET.parent.glob("PICOCALC-NATIVE-PROMOTION--*"))
spec = importlib.util.spec_from_file_location(
    "prior_release_board", previous / "scripts/device/common.py"
)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

PLAYABLE = Path("/tmp/picocalc-native-promotion-rev1/build")
PLAYABLE_SHA = "33b439d0a7bcdf85f01b373ed1ec71d654ce60d7079f2569fce4de859f29e813"


def check_build(build, digest):
    assert release.sha(build / release.APP) == digest
    assert release.sha(build / release.PART) == release.PART_SHA
    assert (build / release.APP).stat().st_size <= 8 * 1024 * 1024


def health(c):
    worlds, painter = release.ready(c)
    assert painter["compiles"] == 1 and painter["installed"] and painter["rejects"] == 0
    assert all(worlds[k]["restarts"] == 0 for k in release.unit.NATIVE)
    c.input_ready()
    return {
        "worlds": sorted(release.unit.NATIVE),
        "painter": painter,
        "i2c": c.counters()["i2c0"],
        "spi": c.counters()["spi2"],
    }


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")
