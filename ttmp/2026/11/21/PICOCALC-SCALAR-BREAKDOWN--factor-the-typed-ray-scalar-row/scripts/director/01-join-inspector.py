"""Rebuild five PC joins and check them against independent row counters and device identities.

Run from the repository root: python3 TICKET/scripts/director/01-join-inspector.py OUTPUT
"""
import json
from pathlib import Path
import subprocess
import sys

ticket = Path(__file__).resolve().parents[2]
inspector_ticket, = ticket.parent.glob("PICOCALC-COMPILER-INSPECT--*")
dest = Path(sys.argv[1]).resolve()
dest.mkdir(parents=True, exist_ok=True)
source = "picocalc-os/worlds/raytrace/raytrace.typed"
cli = "picocalc-os/tools/typed-inspect.mjs"
codegen = ticket / "scripts/compiler/make-backends.mjs"
capture = inspector_ticket / "scripts/01-capture-frame.mjs"
backend = "picocalc-os/compiler/typed-rv32.js"
subprocess.run(["node", codegen, source, backend, dest], check=True, stdout=subprocess.DEVNULL)
records = json.loads((ticket / "various/compiler/rows.json").read_text())
scene = next(s for s in records["scenes"] if s["pose"] == [68, 61, 31, 25])
physical = json.loads((ticket / "various/device/images.json").read_text())
arms = json.loads((dest / "manifest.json").read_text())["variants"]
joined = {}
for name, arm in arms.items():
    pc = dest / (name + "-pc.json")
    candidate = dest / (name + ".js")
    subprocess.run(["node", capture, pc, candidate, source], check=True)
    listing = subprocess.check_output(["node", cli, source, "--target", "rv32", "--function",
                                      "typedRayComputeRow", "--backend", candidate, "--profile", pc, "--jsonl"])
    module, function = map(json.loads, listing.splitlines())
    image = next(row for row in physical if row["id"] == arm["id"])
    assert module["imageSha256"] == image["nativeSHA"]
    counters = scene["counts"][name]
    assert function["executions"] == counters["retired"]
    assert function["stackExecutions"] == counters["stackLoads"] + counters["stackStores"]
    segments = {}
    for item in function["ranges"]:
        segment = item.get("segment", item["role"])
        segments[segment] = segments.get(segment, 0) + sum(w["executions"] for w in item["words"])
    assert segments["fallback"] == 0
    joined[name] = dict(nativeSHA=image["nativeSHA"], rowRetired=function["executions"],
                        stackAccesses=function["stackExecutions"], segments=segments)
print(json.dumps(joined, indent=2))
