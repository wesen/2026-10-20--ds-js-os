#!/usr/bin/env python3
"""Run the fragments board study (PICOCALC-TYPED-F32) and score it.

usage: python3 08-run-board.py OUT CAPTURE [--peripherals on|off-by-user]
       python3 08-run-board.py --score CAPTURE

OUT is staged by 06-stage-board.mjs and built by 07-build-board.sh. The run goes through bench/board/device.py's
run_app from the main checkout (its serial lock, the health checks, and the restore of the playable firmware that the
main checkout's firmware/PLAYABLE.json records). The score: per kernel, cycles per call of each arm (median over six
blocks), and the paired per-block ratio of the Typed arm to each GCC arm with its median and its wins.
"""
import argparse
import json
import re
import statistics
import sys
from pathlib import Path

MAIN = Path("/home/manuel/code/wesen/2026-10-20--ds-js-os")
ARMS = ["gcc -O2", "gcc -O2 -ffp-contract=off", "typed kernel"]
ROW = re.compile(r"^F32FRAG ROW (\w+) (\d) (\d) (\d) (\d+) ([0-9a-f]{8})\s*$")


def score(capture):
    text = (capture / "bench.log").read_text(errors="replace").splitlines()
    begin = next(l for l in text if l.startswith("F32FRAG BEGIN")).split()
    n = int(begin[2])
    assert not any("MISMATCH" in l for l in text), "an arm's results differ from the host's Typed results"
    hashes = {l.split()[2]: l.split()[3:6] for l in text if l.startswith("F32FRAG HASH")}
    cycles = {}
    for l in text:
        m = ROW.match(l)
        if m:
            kernel, block, _, arm, c, h = m.groups()
            cycles.setdefault(kernel, {}).setdefault(int(arm), {})[int(block)] = int(c)
            assert h == hashes[kernel][int(arm)], f"{kernel} arm {arm}: a timed run hashed differently"
    result = {"N": n, "hashes": hashes, "kernels": {}}
    for kernel, arms in cycles.items():
        assert all(len(arms[a]) == 6 for a in range(3)), f"{kernel}: not six blocks per arm"
        k = {"cyclesPerCall": {ARMS[a]: statistics.median(arms[a].values()) / n for a in range(3)}}
        for control in (0, 1):
            ratios = [arms[2][b] / arms[control][b] for b in range(6)]
            k["typed/" + ARMS[control]] = {"median": statistics.median(ratios), "min": min(ratios), "max": max(ratios),
                                            "typedFaster": sum(r < 1 for r in ratios)}
        result["kernels"][kernel] = k
    (capture / "score.json").write_text(json.dumps(result, indent=1) + "\n")
    print(json.dumps(result, indent=1))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out", type=Path, nargs="?")
    parser.add_argument("capture", type=Path)
    parser.add_argument("--score", action="store_true")
    parser.add_argument("--peripherals", choices=("on", "off-by-user"))
    args = parser.parse_args()
    if not args.score:
        sys.path.insert(0, str(MAIN / "bench/board"))
        import device  # noqa: E402
        import playable  # noqa: E402
        app = args.out / "build/f32-fragments.bin"
        assert app.exists(), f"{app}: build the app first (07-build-board.sh OUT)"
        record = playable.load()
        digest = record["app"]["sha256"]
        store = playable.stored(digest)
        device.check_build(store, digest)
        device.run_app(app, args.capture, store, digest, args.peripherals or record.get("peripherals", "on"),
                       device.PORT, 600, begin=b"F32FRAG BEGIN", end=b"F32FRAG END")
        print((args.capture / "after.json").read_text()[:800])
    score(args.capture)


if __name__ == "__main__":
    main()
