#!/usr/bin/env python3
"""Run the matched board trial and qualify the exact embedded Editor kernel."""
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys

DAY = Path(__file__).resolve().parents[2]
SHARED, = DAY.glob("PICOCALC-COMPILER-LAB--*/scripts")


def run(work):
    subprocess.run(["node", SHARED / "03-oracle.mjs", work], check=True)
    editor = json.loads((work / "guest-editor.json").read_text())
    oracle = json.loads((work / "oracle.json").read_text())
    firmware = (work / "build/picocalc-os-p4.bin").read_bytes()
    for lane, info in editor.items():
        data = (work / f"editor-guest-{lane}.bin").read_bytes()
        if (hashlib.sha256(data).hexdigest() != info["sha256"] or
                oracle[lane]["editor"]["raw"] != info["sha256"] or data not in firmware):
            raise ValueError(f"embedded Editor text differs from the linked application in {lane}")
    shared = runpy.run_path(str(SHARED / "04-board.py"))
    base_parse = shared["parse"]

    def parse(log, oracle, guest):
        lines = log.splitlines()
        prefix = "LABGUEST findmatch "
        summary = base_parse("\n".join(line for line in lines if not line.startswith(prefix)), oracle, guest)
        seen = {}
        for line in lines:
            if not line.startswith(prefix):
                continue
            _, op, block, lane, count, duration, hz = line.split()
            key = (int(block), lane)
            if key in seen or int(count) != 128 or int(duration) < 1 or int(hz) < 1:
                raise ValueError(line)
            seen[key] = dict(op=op, block=key[0], lane=lane, count=int(count), cycles=int(duration), clock_hz=int(hz))
        if seen.keys() != {(block, lane) for block in range(16) for lane in editor}:
            raise ValueError("incomplete checked Editor guest batches")
        summary["guest"].extend(seen.values())
        summary["editor_guest"] = editor
        return summary

    main = shared["main"]
    main.__globals__["parse"] = parse
    main()
    receipt = json.loads((work / "physical.json").read_text())
    summary = runpy.run_path(str(SHARED / "05-summarize.py"))
    result = summary["summarize"](receipt)
    for row in result:
        if row["app"] != "editor":
            continue
        guest = receipt["boots"][row["boot"]-1]["guest"]
        def cycles(lane):
            return {r["block"]: r["cycles"]/r["count"] for r in guest
                    if r["op"] == "findmatch" and r["lane"] == lane}
        row["guest_cycles_per_call"] = summary["matched"](cycles("base"), cycles(row["lane"]), range(16))
    (work / "summary.json").write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    run(Path(sys.argv[1]).resolve())
