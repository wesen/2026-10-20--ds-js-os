#!/usr/bin/env python3
"""Check a board study capture and keep its normalized rows.

usage: python3 bench/board/rows.py CAPTURE OUT DEST [--restored SHA256]

CAPTURE is run.py's capture, OUT the staged and built study, DEST a new directory for rows.json, images.json,
bench.log.gz and receipt.json. Row arms follow bench.c: predicate arms are 3+m (0 the firmware's C, 1 plain C,
2 bounds-checked C), frame arms 1+m (0 the firmware's C), cold-compile arms m; Chess is timed for mode 0 and the
last mode. The counts are exact, there must be no SHERROR line, and the capture must have restored the playable
image (PLAYABLE.json's, or --restored).
Promoted from PICOCALC-RAY-PARITY scripts/11-import-board.py (PICOCALC-REPO-LAYOUT Phase A).
"""
import argparse
import collections
import gzip
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playable  # noqa: E402

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("capture", type=Path)
parser.add_argument("out", type=Path)
parser.add_argument("dest", type=Path)
parser.add_argument("--restored")
args = parser.parse_args()
restored = args.restored or playable.load()["app"]["sha256"]
raw = (args.capture / "bench.log").read_bytes()
assert b"SIMDLAB END" in raw and b"SHERROR" not in raw
manifest = json.loads((args.out / "generated/manifest.json").read_text())
modes = len(manifest["records"]) // 2
rows = []
for line in raw.decode(errors="replace").splitlines():
    if line.startswith("SHROW "):
        _, kind, fixture, phase, block, arm, *values = line.split()
        calls = 1 if kind == "frame" else int(values[0])
        rows.append(dict(kind=kind, fixture=fixture, phase=int(phase), block=int(block), arm=int(arm), value=int(values[-1]) / calls))
    if line.startswith("SHCOLD "):
        r = json.loads(line[7:])
        assert r["match"] and r["bytes"] == manifest["records"][2 * r["arm"] + r["family"]]["bytes"], r
        for metric in ("compileUs", "totalUs", "peakBytes"):
            rows.append(dict(kind=metric, fixture=str(r["family"]), phase=0, block=r["block"], arm=r["arm"], value=r[metric]))
counts = collections.Counter(r["kind"] for r in rows)
cold = 6 * 2 * modes
assert counts == dict(pred=16 * 6 * (3 + modes), frame=12 * 6 * (1 + modes) * 3, chess=72,
                      compileUs=cold, totalUs=cold, peakBytes=cold), counts
assert len({(r["kind"], r["fixture"], r["phase"], r["block"], r["arm"]) for r in rows}) == len(rows)
after = json.loads((args.capture / "after.json").read_text())
assert after["sha256"] == restored, after["sha256"]
args.dest.mkdir(parents=True, exist_ok=False)
(args.dest / "rows.json").write_text(json.dumps(rows, separators=(",", ":")) + "\n")
(args.dest / "images.json").write_text(json.dumps(manifest["records"], indent=1) + "\n")
(args.dest / "bench.log.gz").write_bytes(gzip.compress(raw, mtime=0))
health = after["health"]
(args.dest / "receipt.json").write_text(json.dumps(dict(
    study=manifest.get("study"), modes=modes, counts=counts, image=json.loads((args.capture / "image.json").read_text()),
    restored=after["sha256"], peripherals=health.get("peripherals"), worlds=health.get("judged", health.get("worlds")),
    logSHA=hashlib.sha256(raw).hexdigest()), indent=2) + "\n")
print(json.dumps(dict(modes=modes, counts=counts)))
