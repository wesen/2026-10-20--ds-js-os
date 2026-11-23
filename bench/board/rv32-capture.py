#!/usr/bin/env python3
"""Capture the RV32 conformance vectors on the ESP32-P4 and put the playable firmware back (PICOCALC-RV32-CONFORMANCE).

usage: python3 bench/board/rv32-capture.py OUT CAPTURE [--peripherals on|off-by-user] [--deadline SECONDS]
       python3 bench/board/rv32-capture.py --parse OUT CAPTURE     only turn an earlier CAPTURE/bench.log into the file

OUT is a directory built by rv32-build.sh (OUT/build/rv32-vectors.bin, OUT/main/cases.json); CAPTURE is a new
directory for the raw capture. Like run.py, the run checks the playable firmware's health, writes the capture app,
reads its output until RV32VEC END, then rewrites and verifies the playable image that firmware/PLAYABLE.json records
and checks its health again. The results become bench/reference/rv32/p4-captured.jsonl: a header line (board, app,
digest of the inputs) and one row per vector [id, word, input digest, x10, f10, fcsr, window?] in hexadecimal. `node bench/rv32/vectors.mjs`
then turns them into the expectations of vectors.jsonl.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import device  # noqa: E402
import playable  # noqa: E402

REPO = HERE.parents[1]
DEST = REPO / "bench/reference/rv32/p4-captured.jsonl"
LINE = re.compile(rb"^V (\d+) ([0-9a-f]{8}) ([0-9a-f]{8}) ([0-9a-f]{2})(?: ([0-9a-f]+))?\r?$")


def parse(out, capture):
    cases = json.loads((out / "main/cases.json").read_text())
    log = (capture / "bench.log").read_bytes().split(b"\n")
    begin = next(l for l in log if l.startswith(b"RV32VEC BEGIN")).decode().split()
    info = next((l.decode().strip() for l in log if l.startswith(b"RV32VEC INFO")), None)
    assert int(begin[2]) == len(cases), f"the app ran {begin[2]} vectors, cases.json lists {len(cases)}"
    results = {}
    for l in log:
        m = LINE.match(l)
        if m:
            i = int(m[1])
            assert i not in results, f"vector {i} printed twice"
            results[i] = m
    missing = [i for i in range(len(cases)) if i not in results]
    assert not missing, f"{len(missing)} vectors without a result, first {missing[:5]}"
    image = json.loads((capture / "image.json").read_text()) if (capture / "image.json").exists() else {}
    header = {"board": "ESP32-P4", "info": info, "digest": begin[3], "vectors": len(cases),
              "app": image.get("sha256"), "capture": capture.name}
    lines = [json.dumps(header)]
    for i, c in enumerate(cases):
        m = results[i]
        row = [c["id"], c["word"][2:], c["in"], m[2].decode(), m[3].decode(), m[4].decode()]
        if c["mem"]:
            assert m[5], f"{c['id']}: memory vector without its window"
            row.append(m[5].decode())
        lines.append(json.dumps(row, separators=(",", ":")))
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text("\n".join(lines) + "\n")
    print(f"{DEST}: {len(cases)} vectors from {info}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out", type=Path)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--parse", action="store_true")
    parser.add_argument("--peripherals", choices=("on", "off-by-user"))
    parser.add_argument("--deadline", type=int, default=600)
    parser.add_argument("--port", default=device.PORT)
    args = parser.parse_args()
    if not args.parse:
        app = args.out / "build/rv32-vectors.bin"
        assert app.exists(), f"{app}: build the app first (bench/board/rv32-build.sh OUT)"
        record = playable.load()
        digest = record["app"]["sha256"]
        store = playable.stored(digest)
        device.check_build(store, digest)
        peripherals = args.peripherals or record.get("peripherals", "on")
        device.run_app(app, args.capture, store, digest, peripherals, args.port, args.deadline,
                       begin=b"RV32VEC BEGIN", end=b"RV32VEC END")
        print(json.dumps(json.loads((args.capture / "after.json").read_text()), indent=1)[:1500])
    parse(args.out, args.capture)


if __name__ == "__main__":
    main()
