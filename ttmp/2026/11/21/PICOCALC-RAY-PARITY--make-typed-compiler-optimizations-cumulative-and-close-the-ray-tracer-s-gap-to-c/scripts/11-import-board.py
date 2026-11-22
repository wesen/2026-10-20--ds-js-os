"""Check a board capture from 10-stage-board.py and keep normalized rows.

usage: python3 11-import-board.py CAPTURE_DIR BUILD_DIR OUT_DIR [RESTORED_SHA256]

RESTORED_SHA256 is the playable app the run restored (default: e7b771aa…, the target until
COMPILE-BUDGET; later runs restore the app in /tmp/picocalc-current-playable.txt).

Generalizes 07-import-board.py to any number of modes (read from the build manifest).
Row arms follow bench.c: predicate arms are 3+m, frame arms 1+m, cold arms m; Chess is
timed for mode 0 and the last mode. Expects no SHERROR line.
"""
from pathlib import Path
import collections, gzip, hashlib, json, sys

run, build, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
restored = sys.argv[4] if len(sys.argv) > 4 else "e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5"
raw = (run / "bench.log").read_bytes()
assert b"SIMDLAB END" in raw and b"SHERROR" not in raw
manifest = json.loads((build / "generated/manifest.json").read_text())
modes = len(manifest["records"]) // 2
rows = []
for line in raw.decode(errors="replace").splitlines():
    if line.startswith("SHROW "):
        _, kind, fixture, phase, block, arm, *values = line.split()
        calls = 1 if kind == "frame" else int(values[0])
        rows.append(dict(kind=kind, fixture=fixture, phase=int(phase), block=int(block), arm=int(arm),
                         value=int(values[-1]) / calls))
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
after = json.loads((run / "after.json").read_text())
assert after["sha256"] == restored, after["sha256"]
out.mkdir(parents=True, exist_ok=True)
(out / "rows.json").write_text(json.dumps(rows, separators=(",", ":")) + "\n")
(out / "images.json").write_text(json.dumps(manifest["records"], indent=1) + "\n")
(out / "bench.log.gz").write_bytes(gzip.compress(raw, mtime=0))
(out / "receipt.json").write_text(json.dumps(dict(
    modes=modes, counts=counts, image=json.loads((run / "image.json").read_text()),
    restored=after["sha256"], worlds=after["health"]["worlds"], logSHA=hashlib.sha256(raw).hexdigest()), indent=2) + "\n")
print(json.dumps(dict(modes=modes, counts=counts)))
