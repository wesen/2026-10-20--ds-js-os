#!/usr/bin/env python3
"""The experiment image on the PicoCalc, against the playable firmware it would replace.

usage (repository root): python3 ttmp/.../scripts/06-board.py NEW_BUILD OUT [--peripherals on|off-by-user]

Under one hold of the board lock:
  before  verify the recorded playable image is on the board (verify_flash resets it), capture its boot, check health,
          then exercise the features: the worlds, the painter, the raytrace view's four scenes (C, Candela mix,
          Candela tile, the Typed ray tracer, which compiles on first display), a screen capture of each
  after   write and verify NEW_BUILD's app, capture its boot, check health, the same features
It writes OUT/{before,after}/{uart.log,features.json,scene-N.png} and OUT/summary.json: every boot compile's time
against its deadline (the 75 % rule) and the feature comparison. It does not restore the playable image; run
bench/board/gallery.py on the experiment, then make restore-playable.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(REPO / "bench/board"))
import device  # noqa: E402
import gallery  # noqa: E402
import playable  # noqa: E402

COMPILE = re.compile(r"^(\S+) compile source=(\S+) status=(\S+) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)")
# The deadlines and policies of the image being replaced (the deleted per-app files and typed_p4.c's defaults).
OLD_DEADLINES_US = {"agenda": 1700000, "files": 1700000, "editor": 6000000, "chess": 6000000, "candela": 8000000,
                    "mobile-painter": 8000000, "typed-ray": 8000000}


def wait_line(console, pattern, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            line = console.line(deadline).decode(errors="replace")
        except TimeoutError:
            return None
        if re.search(pattern, line):
            return line
    return None


def features(console, out):
    rec = gallery.Records(out / "cgal.jsonl")
    worlds = console.worlds()
    result = {"worlds": {n: {k: w.get(k) for k in ("engine", "file", "state", "restarts", "last_error")}
                         for n, w in sorted(worlds.items())},
              "painter": device.painter(console)}
    typed = console.command("typed", timeout=5)
    result["typed"] = [json.loads(l[9:]) for l in typed if l.startswith("TYPEDAPP {")] or typed[-1:]
    console.command("key f1")
    time.sleep(1.5)
    console.command("key v")
    time.sleep(2.5)
    scenes = {}
    for scene in range(4):
        if scene:
            console.command("key g")
            if scene == 3:
                scenes["trload"] = wait_line(console, r"^TRLOAD ", 30)
            time.sleep(2.5)
        shot = gallery.shot(console, rec, out)
        (out / "boot.png").rename(out / f"scene-{scene}.png")
        scenes[str(scene)] = shot
    result["scenes"] = scenes
    console.command("key f1")
    return result


def boot(log_path):
    rows = {}
    for line in Path(log_path).read_text(errors="replace").splitlines():
        m = COMPILE.match(line.strip())
        if m:
            rows.setdefault(m[1], []).append({"source": m[2], "status": m[3], "us": int(m[4]), "peakJsBytes": int(m[5]),
                                              "moduleBytes": int(m[6])})
    return rows


def phase(name, out, port, peripherals, write=None, verify=None):
    d = out / name
    d.mkdir(parents=True)
    with (d / "uart.log").open("wb", buffering=0) as log:
        device.hold(device.Console(port, log))
        if write:
            device.write_app(write, d, "experiment", port)
        else:
            device.esp("verify_flash", verify, d, "verify-playable", port)
        console = device.Console(port, log)
        try:
            health = device.health(console, peripherals)
            feats = features(console, d)
        finally:
            console.close()
    value = {"health": health, "features": feats, "compiles": boot(d / "uart.log")}
    device.save(d / "features.json", value)
    return value


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("build", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--peripherals", choices=("on", "off-by-user"))
    ap.add_argument("--port", default=device.PORT)
    a = ap.parse_args()
    record = playable.load()
    store = playable.stored(record["app"]["sha256"])
    device.check_build(store, record["app"]["sha256"])
    new = device.check_build(a.build)
    peripherals = a.peripherals or record.get("peripherals", "on")
    a.out.mkdir(parents=True, exist_ok=False)
    with device.acquire():
        before = phase("before", a.out, a.port, peripherals, verify=store)
        after = phase("after", a.out, a.port, peripherals, write=a.build)
    deadlines = {t["name"]: t["deadlineUs"] for t in after["features"]["typed"] if isinstance(t, dict)}
    names = {"chess/painter": "mobile-painter", "raytrace": "typed-ray"}
    budget = {}
    for app, rows in after["compiles"].items():
        old = before["compiles"].get(names.get(app, app), [])
        dl = deadlines.get(app)
        budget[app] = {"us": [r["us"] for r in rows], "status": [r["status"] for r in rows], "deadlineUs": dl,
                       "share": [round(r["us"] / dl, 3) for r in rows] if dl else None,
                       "within75": all(r["us"] <= 0.75 * dl and r["status"] == "ok" for r in rows) if dl else None,
                       "moduleBytes": [r["moduleBytes"] for r in rows], "oldUs": [r["us"] for r in old],
                       "oldModuleBytes": [r["moduleBytes"] for r in old],
                       "oldDeadlineUs": OLD_DEADLINES_US.get(names.get(app, app))}
    bw, aw = before["features"]["worlds"], after["features"]["worlds"]
    same_worlds = {n: (bw.get(n, {}).get("engine"), bw.get(n, {}).get("file")) == (w["engine"], w["file"])
                   for n, w in aw.items()}
    scenes = {s: {"before": before["features"]["scenes"].get(s), "after": after["features"]["scenes"].get(s)}
              for s in ("0", "1", "2", "3", "trload")}
    summary = {"playable": record["app"]["sha256"], "experiment": new, "peripherals": peripherals,
               "budget": budget, "worldsSame": all(same_worlds.values()) and set(bw) == set(aw),
               "worldDiffs": {n: [bw.get(n), aw.get(n)] for n, s in same_worlds.items() if not s},
               "missingWorlds": sorted(set(bw) - set(aw)), "painter": [before["features"]["painter"],
                                                                     after["features"]["painter"]],
               "scenes": scenes}
    device.save(a.out / "summary.json", summary)
    print(json.dumps(summary, indent=1)[:6000])


if __name__ == "__main__":
    main()
