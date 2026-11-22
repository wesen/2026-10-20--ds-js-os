"""Measure the Candela world on the PicoCalc, then restore the playable firmware.

usage (any directory):
    python3 08-run-device.py --image BUILD --reference NODE_REFERENCE.json --probes PROBES.json --out DIR \
        [--port /dev/ttyACM0] [--plan full|smoke|params] [--peripherals on|off-by-user]

BUILD is the measurement image's ESP-IDF build directory (build-smooth-chess.sh BUILD -D PICOCALC_CANDELA_WORLD=ON).
The restore image is read from /tmp/picocalc-current-playable.txt ("<build dir> <app sha256>") once the lock is held.
Under the shared serial lock (board_common.acquire, as PICOCALC-SIMD-LAB's 02-run-board.py and
PICOCALC-COMPILE-BUDGET's 02-run-arms-firmware.py do): check both builds; record the playable image's health; quiesce
I2C (hold); write and verify the measurement app at 0x10000 only; check its health; send the plan's messages to the
candela world (console: send candela TYPE JSON) and collect its "CW {json}" records and any fault frame; then, in a
finally clause, quiesce, write and verify the playable app and record its health. With --peripherals on, a health
check that finds the keyboard's I2C transfers failing stops the run (board_common.health raises); with off-by-user
(the user switched the keyboard and display off on purpose) they are recorded as "off by user" (lib/board_health.py).

Writes DIR/uart.log (every byte read), DIR/cw.jsonl (each record with the step that produced it), DIR/before.json,
DIR/candidate.json, DIR/after.json, DIR/start-heap.txt and DIR/end-{stats,heap,worlds}.txt (the measurement image's
console before and after the plan) and DIR/run.json (images, restore target, plan, timings of the run itself).
"""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

ticket = Path(__file__).resolve().parents[1]
repo = next(p for p in ticket.parents if (p / ".git").exists())
device = next((repo / "ttmp/2026/11/20").glob("PICOCALC-RAYTRACE--*")) / "scripts/device"
sys.path.insert(0, str(device))
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from board_common import acquire, check_build, release, save  # noqa: E402
from board_health import board_health  # noqa: E402

DONE = {"load": {"load"}, "build": {"build"}, "param": {"param"}, "time": {"time"}, "status": {"status"},
        "params": {"params"}, "scenes": {"scenes"}, "rebuilds": {"suite-end"}, "stop": {"stop"}}


def plan_messages(kind, reference, probes):
    msgs = []
    add = lambda step, typ, payload=None, timeout=20: msgs.append((step, typ, payload, timeout))
    def policy():   # the re-pack policy: light scenes in an ordinary turn, heavy ones (last pack > 25 ms) in a long one
        for sid, pid, values in (("M-03", "n", (1.2, 1.8, 2.2)), ("M-09", "along", (0.2, 0.5, 0.8)),
                                 ("D-02", "gloss", (0.2, 0.6)), ("L-03", "elevation", (0.3, 0.6, 1.0))):
            add(f"{sid.lower()}-build", "build", {"id": sid, "render": True})
            for v in values:
                add(f"{sid.lower()}-{pid}-{v}", "param", {"id": pid, "value": v})
        add("l05-build", "build", {"id": "L-05", "render": True})
        for t in (0.5, 1.5):
            add(f"l05-time-{t}", "time", {"t": t})
    if kind == "params":
        add("load-0", "load", None, 20)
        policy()
        add("final-status", "status")
        return msgs
    # module load and B-01, three fresh runtimes: load, a cold build, then (in the first) three warm builds
    for k in range(3 if kind == "full" else 1):
        if k:
            msgs.append((f"restart-{k}", "#restart", None, 10))
        add(f"load-{k}", "load", None, 20)
        add(f"b01-cold-{k}", "build", {"id": "B-01", "measure": True, "render": False})
        if k == 0:
            for w in range(3):
                add(f"b01-warm-{w}", "build", {"id": "B-01", "measure": True, "render": False})
    if kind == "full":
        for sid in reference["scenes"]:
            add(f"suite-{sid}", "build", {"id": sid, "measure": True, "render": False}, 30)
    # a slider on B-01 (B-01p: B-01 with a dynamic roughness), then natural dynamic and static parameters
    add("b01p-build", "build", {"id": "B-01p", "measure": False, "render": True})
    for v in (0.1, 0.25, 0.5, 0.75, 0.9):
        add(f"b01p-param-{v}", "param", {"id": "rough", "value": v})
    add("b01p-status", "status")
    if kind == "full":
        policy()
        add("e03-build", "build", {"id": "E-03", "render": True})
        add("e03-depth-static", "param", {"id": "depth", "value": 6}, 30)
        add("rebuilds-b01", "rebuilds", {"id": "B-01", "n": 10}, 120)
        for pid, p in probes.items():
            add(f"probe-{pid}", "build", {"id": pid, "files": p["files"], "render": False})
    add("final-status", "status")
    return msgs


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--image", type=Path, required=True)
    ap.add_argument("--reference", type=Path, required=True)
    ap.add_argument("--probes", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--port", default="/dev/ttyACM0")
    ap.add_argument("--plan", choices=("full", "smoke", "params"), default="full")
    ap.add_argument("--peripherals", choices=("on", "off-by-user"), default="on",
                    help="off-by-user: the keyboard and display are off on purpose; health is recorded without them")
    a = ap.parse_args()
    image_sha = hashlib.sha256((a.image / release.APP).read_bytes()).hexdigest()
    check_build(a.image, image_sha)
    reference, probes = json.loads(a.reference.read_text()), json.loads(a.probes.read_text())
    msgs = plan_messages(a.plan, reference, probes)
    a.out.mkdir(parents=True, exist_ok=False)
    run = {"image": str(a.image), "imageSha256": image_sha, "port": a.port, "plan": a.plan, "steps": len(msgs), "started": time.time()}
    with acquire(), (a.out / "uart.log").open("ab", buffering=0) as log, (a.out / "cw.jsonl").open("w") as cw:
        # the playable image is whatever /tmp/picocalc-current-playable.txt names once the lock is ours
        restore_dir, restore_sha = Path("/tmp/picocalc-current-playable.txt").read_text().split()
        restore = Path(restore_dir)
        check_build(restore, restore_sha)
        run.update(restore=str(restore), restoreSha256=restore_sha, locked=time.time())
        save(a.out / "run.json", run)
        def connect():
            return release.unit.Console(a.port, log)
        console = connect()
        try:
            save(a.out / "before.json", {"sha256": restore_sha, "health": board_health(console, a.peripherals)})
        finally:
            console.close()
        console = connect()
        release.hold(console)   # closes the console
        try:
            release.esp("write_flash", a.image, a.out, "candidate-write", a.port)
            release.esp("verify_flash", a.image, a.out, "candidate-verify", a.port)   # hard reset
            console = connect()
            save(a.out / "candidate.json", {"sha256": image_sha, "health": board_health(console, a.peripherals)})
            (a.out / "start-heap.txt").write_text("\n".join(console.command("heap", timeout=10)) + "\n")
            misses = 0
            for step, typ, payload, timeout in msgs:
                t0 = time.monotonic()
                if typ == "#restart":
                    console.command("restart candela", timeout=5)
                    time.sleep(1.0)
                    continue
                line = f"send candela {typ}" + (" " + json.dumps(payload, separators=(",", ":")) if payload is not None else "")
                console.command(line, timeout=5)
                deadline = time.monotonic() + timeout
                got = None
                while time.monotonic() < deadline and got is None:
                    try:
                        raw = console.line(deadline).decode(errors="replace")
                    except TimeoutError:
                        break
                    if raw.startswith("CW {"):
                        rec = json.loads(raw[3:])
                        cw.write(json.dumps({"step": step, "hostMs": round(1000 * (time.monotonic() - t0)), **rec}) + "\n"); cw.flush()
                        if rec.get("ev") in DONE[typ] or rec.get("ev") == "error":
                            got = rec
                    elif raw.startswith("#OCT1 ") and '"world":"candela"' in raw:
                        fault = json.loads(raw[6:])
                        cw.write(json.dumps({"step": step, "ev": "fault", "hostMs": round(1000 * (time.monotonic() - t0)), **fault}) + "\n"); cw.flush()
                        got = fault
                        time.sleep(1.0)   # the world restarts after 100 ms
                if got is None:
                    cw.write(json.dumps({"step": step, "ev": "timeout", "timeoutS": timeout}) + "\n"); cw.flush()
                print(f"{step}: {(got or {}).get('ev', 'timeout')} {round(time.monotonic() - t0, 2)} s", flush=True)
                misses = misses + 1 if got is None else 0
                if (step.startswith("load") and (got or {}).get("ev") != "load") or misses >= 3:
                    print(f"stopping the plan after {step}", flush=True)   # the world does not answer: restore now
                    break
            for cmd in ("stats", "heap", "worlds"):
                (a.out / f"end-{cmd}.txt").write_text("\n".join(console.command(cmd, timeout=10)) + "\n")
            save(a.out / "candidate-after.json", {"health": board_health(console, a.peripherals)})
            release.hold(console)
        finally:
            try:
                console.close()
            except Exception:
                pass
            release.esp("write_flash", restore, a.out, "restore-write", a.port)
            release.esp("verify_flash", restore, a.out, "restore-verify", a.port)
            console = connect()
            try:
                save(a.out / "after.json", {"sha256": restore_sha, "health": board_health(console, a.peripherals)})
            finally:
                console.close()
    run["finished"] = time.time()
    save(a.out / "run.json", run)
    print((a.out / "after.json").read_text())


if __name__ == "__main__":
    main()
