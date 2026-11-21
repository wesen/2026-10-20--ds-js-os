"""Audit the final shadow matrix, compare its stock outputs and account for the installed firmware."""
import hashlib
import json
import statistics
import sys
import zlib
from pathlib import Path

ticket = Path(__file__).resolve().parents[2]
physical = Path(sys.argv[1])
frozen = Path(sys.argv[2])
evidence = ticket / "various/device"
load_json = lambda path: json.loads(path.read_text())
app = load_json(evidence / "shadow-build.json")
old = load_json(evidence / "build.json")
rows = load_json(physical / "rows.json")
loads = load_json(physical / "loads.json")
final = load_json(physical / "final.json")
timed = load_json(evidence / "rows.json")
expected = {x["fixture"]: x["crc"] for x in timed}
assert final["qualified"] and final["appSHA"] == app["appSHA"]
assert app["partitionSHA"] == old["partitionSHA"] == final["partitionSHA"]
assert old["sdkconfigSHA"] == app["sdkconfigSHA"]
assert len(rows) == len({(o["program"], o["fixture"], o["block"]) for o in rows}) == 192
assert len(expected) == 12 and set(x["fixture"] for x in rows) == set(expected)
assert all(o["crc"] == expected[o["fixture"]] for o in rows)
assert len(loads) == len({(o["program"], o["block"]) for o in loads}) == 16
images = {r["id"]: r for r in load_json(evidence / "shadow-images.json")}
oldstock = next(r for r in load_json(evidence / "images.json") if r["id"] == 0)
assert oldstock["nativeSHA"] == images[0]["nativeSHA"] and oldstock["elfSHA"] == images[0]["elfSHA"]
assert all(r["elfCRC"] == images[r["program"]]["elfCRC"] for r in loads)
assert [r["program"] for r in load_json(physical / "retained.json")] == list(range(14))
cold = {}
for arm in (0, 14):
    current = [r for r in loads if r["program"] == arm]
    assert len(current) == 8
    assert [r["position"] for r in current] == ([0,1] if arm == 0 else [1,0]) * 4
    cold[arm] = {field: statistics.median(r[field] for r in current)
                 for field in ("compilerUs", "elapsedUs", "peakJSBytes", "segmentBytes")}
def crop(data):
    assert len(data) == 320 * 320 * 2
    return b"".join(data[2*((32+y)*320+40):2*((32+y)*320+280)] for y in range(240))
screens = []
for frame in ("typed-default", "typed-right", "typed-relit", "handoff"):
    pixels = crop((physical / (frame + ".rgb565")).read_bytes())
    assert pixels == crop((frozen / (frame + ".rgb565")).read_bytes())
    screens.append(dict(frame=frame, words=len(pixels)//2, crc32=f"{zlib.crc32(pixels):08x}",
                        sha256=hashlib.sha256(pixels).hexdigest()))
assert b"compositor crashed" not in (physical / "uart.log").read_bytes()
for log in ("previous-readback", "candidate-readback", "final-readback"):
    assert (physical / (log + ".log")).read_text().count("verify OK") == 2
print(json.dumps(dict(app=app["appSHA"], partition=app["partitionSHA"], unchangedStockELF=oldstock["elfSHA"],
                      checksumBlocks=len(rows), loads=len(loads), ordinaryScreenComparisons=screens,
                      cold=cold, flashReadbackVerified=["previous app and partition","candidate app and partition","final app and partition"],
                      uartSHA256=hashlib.sha256((physical / "uart.log").read_bytes()).hexdigest()), indent=2))
