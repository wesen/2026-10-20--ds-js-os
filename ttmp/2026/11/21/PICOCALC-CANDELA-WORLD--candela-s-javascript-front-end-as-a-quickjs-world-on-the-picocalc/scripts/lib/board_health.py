"""Board health for the Candela world's device runs, with the keyboard and display either on or off by the user.

board_health(console, peripherals): with peripherals == "on", PICOCALC-RAYTRACE's board_common.health (native worlds
healthy, painter installed, keyboard I2C transfers increasing without errors). With "off-by-user" (the user has
switched the display and keyboard off on purpose), the keyboard I2C probe is skipped and the keyboard, display and
compositor worlds are recorded but not judged; the other native worlds must be running natively without a crash,
and the painter must have compiled once without rejects. The I2C counters are recorded either way.
"""
import json
import re
import sys
from pathlib import Path

ticket = Path(__file__).resolve().parents[2]
repo = next(p for p in ticket.parents if (p / ".git").exists())
sys.path.insert(0, str(next((repo / "ttmp/2026/11/20").glob("PICOCALC-RAYTRACE--*")) / "scripts/device"))
from board_common import health, release  # noqa: E402

PERIPHERAL_WORLDS = ("keyboard", "display", "compositor")
BUS = re.compile(r"bus (\S+)\s+busy\s+(\d+[.]\d+) ms, (\d+) transfers, (\d+) bytes, (\d+) errors")


def board_health(console, peripherals="on"):
    if peripherals == "on":
        return {"peripherals": "on", **health(console)}
    lines = console.command("worlds", timeout=10)
    worlds = {w["name"]: w for w in next(json.loads(l) for l in lines if l.startswith('[{"name":'))}
    seen = {k: {f: worlds.get(k, {}).get(f) for f in ("engine", "file", "state", "restarts", "last_error")} for k in release.unit.NATIVE}
    judged = [k for k in release.unit.NATIVE if k not in PERIPHERAL_WORLDS]
    bad = [k for k in judged if seen[k]["engine"] != "native" or seen[k]["file"] != release.unit.NATIVE[k]
           or seen[k]["state"] in ("crashed", "stopped", "restarting") or seen[k]["last_error"]]
    if bad:
        raise RuntimeError(f"native worlds unhealthy with peripherals off: {[(k, seen[k]) for k in bad]}")
    painter = release.painter(console)
    if painter["compiles"] != 1 or not painter["installed"] or painter["rejects"]:
        raise RuntimeError(f"painter {painter}")
    buses = {}
    for line in console.command("stats", timeout=10):
        m = BUS.search(line)
        if m:
            buses[m[1]] = dict(zip(("busyMs", "transfers", "bytes", "errors"), (float(m[2]), int(m[3]), int(m[4]), int(m[5]))))
    return {"peripherals": "off by user", "keyboard": "off by user", "display": "off by user",
            "worlds": seen, "judged": judged, "painter": painter, "i2c": buses.get("i2c0"), "spi": buses.get("spi2")}
