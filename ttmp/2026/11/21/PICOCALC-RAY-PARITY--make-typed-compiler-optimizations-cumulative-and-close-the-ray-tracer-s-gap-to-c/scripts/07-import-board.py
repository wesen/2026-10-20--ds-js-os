"""Check a completed board capture from 06-stage-board.py and keep normalized rows.

usage: python3 07-import-board.py CAPTURE_DIR BUILD_DIR

Row arms follow bench.c: predicate rows put three C variants before the compiled modes
(arm 3+m is mode m), frame rows put the scalar C frame first (arm 1+m), and cold rows
number the modes directly. Mode m is various/07-board-modes.json[m].

Cold rows of mode 1 are expected to fail: cold.c formats the options into char cell[180],
and mode 1's JSON is longer, so QuickJS sees a truncated literal (SyntaxError: invalid
property name). The failures are counted and kept in the receipt.
"""
from pathlib import Path
import collections, gzip, hashlib, json, sys

ticket = Path(__file__).resolve().parents[1]
run, build = Path(sys.argv[1]), Path(sys.argv[2])
various = ticket / "various"
raw = (run / "bench.log").read_bytes()
assert b"SIMDLAB END" in raw
manifest = json.loads((build / "generated/manifest.json").read_text())
rows, errors = [], collections.Counter()
for line in raw.decode(errors="replace").splitlines():
    if line.startswith("SHERROR "):
        errors[line[8:]] += 1
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
assert counts == dict(pred=16 * 6 * 7, frame=12 * 6 * 5 * 3, chess=72, compileUs=36, totalUs=36, peakBytes=36), counts
assert errors == {"compile SyntaxError: invalid property name": 12}, errors
assert {r["arm"] for r in rows if r["kind"] == "compileUs"} == {0, 2, 3}
assert len({(r["kind"], r["fixture"], r["phase"], r["block"], r["arm"]) for r in rows}) == len(rows)
after = json.loads((run / "after.json").read_text())
assert after["sha256"] == "e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5"
assert manifest["records"][0]["sha"] == "2e33bb648fd24dc470769ef92cb72be3a793cf4a8de4e964cbbed273b91684ac"
board = various / "13-board"
board.mkdir(exist_ok=True)
(board / "rows.json").write_text(json.dumps(rows, separators=(",", ":")) + "\n")
(board / "images.json").write_text(json.dumps(manifest["records"], indent=1) + "\n")
(board / "bench.log.gz").write_bytes(gzip.compress(raw, mtime=0))
(board / "receipt.json").write_text(json.dumps(dict(
    counts=counts, coldErrors=errors, image=json.loads((run / "image.json").read_text()),
    restored=after["sha256"], worlds=after["health"]["worlds"], logSHA=hashlib.sha256(raw).hexdigest()), indent=2) + "\n")
print(json.dumps(dict(counts=counts, errors=errors)))
