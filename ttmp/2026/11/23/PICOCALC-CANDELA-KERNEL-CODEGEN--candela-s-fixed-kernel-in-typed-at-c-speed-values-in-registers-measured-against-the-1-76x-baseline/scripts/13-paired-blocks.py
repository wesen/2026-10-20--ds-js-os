#!/usr/bin/env python3
"""13-paired-blocks.py: 09-paired.py with the board lock held per block (PICOCALC-CANDELA-KERNEL-CODEGEN).

usage: python3 -I 13-paired-blocks.py OUT BUILD [--blocks 4] [--passes 4] [ID ...]

The same study as 09-paired.py (PICOCALC-CANDELA-TYPED's configuration): per block and scene, "gallery digest ID
PASSES psram typed" and "... cpp", the order alternating by block, PASSES passes from a fresh accumulation; per scene
the median over blocks of the typed/cpp ratio of cycles per sample. Other agents share the board, so the lock is
taken for one block at a time. A block runs only on BUILD's image without a reboot since the last check: at the start
of each block the kernel clock (`stats`) must have advanced by the wall time since the end of the previous block
(less 5 s). Otherwise, and before the first block, the block first installs BUILD under the same lock (hold, write,
verify, health with peripherals on) and warms the Typed arm up (its compile runs on its first digest).
Writes OUT/rows.jsonl, OUT/blocks.jsonl (per block: installed or not, uptimes, wall times), OUT/uart-N.log, OUT/summary.json.
"""
import argparse
import json
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / "AGENTS.md").exists())
sys.path.insert(0, str(REPO / "bench/board"))
sys.path.insert(0, str(HERE))
import device  # noqa: E402

REFS = {"cpp": REPO / "bench/reference/candela-gallery/rv32-4-passes.jsonl",
        "typed": REPO / "bench/reference/candela-gallery/typed-4-passes.jsonl"}


def digest(console, rows, sid, passes, arm, block, timeout=1200):
    console.send(f"gallery digest {sid} {passes} psram {arm}")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        raw = console.line(deadline).decode(errors="replace").strip()
        if "Guru Meditation" in raw or "assert failed" in raw:
            raise RuntimeError(f"board crashed: {raw}")
        if raw.startswith("CGAL {"):
            r = json.loads(raw[5:])
            if r.get("ev") == "error":
                raise RuntimeError(f"{sid} {arm}: {r}")
            if r.get("ev") == "digest" and r.get("id") == sid and r.get("arm") == arm:
                r["block"] = block
                rows.write(json.dumps(r) + "\n")
                rows.flush()
                return r
    raise TimeoutError(f"{sid} {arm}: no digest within {timeout} s")


def gallery_checks(out, build):
    """Under one lock hold: install BUILD, then bench/board/gallery.py --arm typed and --arm cpp (18/18 each) on it.
    Returns (wall seconds, kernel ms) at the end, the reference the first block's continuity check starts from."""
    import contextlib
    import gallery
    with device.acquire(), (out / "gallery-install.log").open("wb", buffering=0) as log:
        (out / "gallery-install").mkdir()
        info = {"heldBeforeFlash": device.quiesce(device.PORT, log)}
        device.write_app(build, out / "gallery-install", "gallery")
        console = device.Console(device.PORT, log)
        try:
            info["health"] = device.health(console, "on")
        finally:
            console.close()
        device.save(out / "gallery-install" / "after.json", info)
        real, device.acquire = device.acquire, contextlib.nullcontext  # the lock is held here
        try:
            for arm in ("typed", "cpp"):
                sys.argv = ["gallery.py", str(out / f"gallery-{arm}"), "--arm", arm]
                rc = gallery.main()
                print(json.dumps({"gallery": arm, "allSame": rc == 0}), flush=True)
        finally:
            device.acquire = real
        console = device.Console(device.PORT, log)
        try:
            return time.time(), console.uptime_ms()
        finally:
            console.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("build", type=Path)
    ap.add_argument("--gallery", action="store_true", help="first install BUILD and run gallery.py for both arms")
    ap.add_argument("--blocks", type=int, default=4)
    ap.add_argument("--passes", type=int, default=4)
    ap.add_argument("ids", nargs="*")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    device.check_build(a.build)
    refs = {arm: {r["id"]: r for r in map(json.loads, p.read_text().splitlines())} for arm, p in REFS.items()}
    ids = a.ids or list(refs["cpp"])
    rows = (a.out / "rows.jsonl").open("w")
    blocks = (a.out / "blocks.jsonl").open("w")
    last = None  # (wall seconds, kernel ms) at the end of the previous block
    if a.gallery:
        last = gallery_checks(a.out, a.build)
    for block in range(a.blocks):
        with device.acquire(), (a.out / f"uart-{block}.log").open("wb", buffering=0) as log:
            info = {"block": block, "acquiredAt": time.time()}
            console = None
            try:
                if last is not None:
                    console = device.Console(device.PORT, log)
                    up = console.uptime_ms()
                    info["uptimeMs"] = up
                    info["continuous"] = up >= last[1] + (time.time() - last[0]) * 1000 - 5000
                if last is None or not info["continuous"]:
                    if console:
                        console.close()
                    info["heldBeforeFlash"] = device.quiesce(device.PORT, log)
                    (a.out / f"install-{block}").mkdir()
                    device.write_app(a.build, a.out / f"install-{block}", f"block{block}")
                    console = device.Console(device.PORT, log)
                    info["health"] = device.health(console, "on")
                    warm = digest(console, rows, ids[0], a.passes, "typed", -1 - block)
                    info["warmupBeginMs"] = warm.get("beginMs")
                    print(json.dumps({"block": block, "installed": True, "warmupBeginMs": warm.get("beginMs")}), flush=True)
                for sid in ids:
                    for arm in (("typed", "cpp") if block % 2 == 0 else ("cpp", "typed")):
                        r = digest(console, rows, sid, a.passes, arm, block)
                        print(json.dumps({k: r[k] for k in ("block", "id", "arm", "cyclesPerSample", "seconds", "acc")}), flush=True)
                end = console.uptime_ms()
                last = (time.time(), end)
                info.update(endUptimeMs=end, releasedAt=time.time())
            finally:
                blocks.write(json.dumps(info, default=str) + "\n")
                blocks.flush()
                if console:
                    console.close()
    got = [json.loads(line) for line in (a.out / "rows.jsonl").read_text().splitlines()]
    summary = {"blocks": a.blocks, "passes": a.passes, "scenes": {}}
    for sid in ids:
        by = {(r["block"], r["arm"]): r for r in got if r["id"] == sid and r["block"] >= 0}
        cyc = [by[b, "typed"]["cyclesPerSample"] / by[b, "cpp"]["cyclesPerSample"] for b in range(a.blocks)]
        sec = [by[b, "typed"]["seconds"] / by[b, "cpp"]["seconds"] for b in range(a.blocks)]
        same = all(by[b, arm][k] == refs[arm][sid][k] for b in range(a.blocks) for arm in ("typed", "cpp")
                   for k in ("frame0", "acc", "disp"))
        summary["scenes"][sid] = {
            "typedCyclesPerSample": statistics.median(by[b, "typed"]["cyclesPerSample"] for b in range(a.blocks)),
            "cppCyclesPerSample": statistics.median(by[b, "cpp"]["cyclesPerSample"] for b in range(a.blocks)),
            "typedSecPerPass": statistics.median(by[b, "typed"]["seconds"] for b in range(a.blocks)) / a.passes,
            "cppSecPerPass": statistics.median(by[b, "cpp"]["seconds"] for b in range(a.blocks)) / a.passes,
            "ratioCycles": statistics.median(cyc), "ratioCyclesRange": [min(cyc), max(cyc)],
            "ratioSeconds": statistics.median(sec), "ratioSecondsRange": [min(sec), max(sec)],
            "digestsMatchReference": same}
    ratios = [s["ratioCycles"] for s in summary["scenes"].values()]
    summary["geomeanRatioCycles"] = statistics.geometric_mean(ratios)
    (a.out / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print(json.dumps({"geomeanRatioCycles": summary["geomeanRatioCycles"]}))


if __name__ == "__main__":
    main()
