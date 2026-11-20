#!/usr/bin/env python3
"""Validate and pair P4 Editor preview copy cycles with the cold compile receipt."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
LAB, = DAY.glob("PICOCALC-COMPILER-LAB--*/scripts/05-summarize.py")
lib = runpy.run_path(str(LAB))
COUNTS = range(8)


def kernels(work):
    image = (work / "build/picocalc-os-p4.bin").read_bytes()
    data = json.loads((work / "copy-guest.json").read_text())
    for values in data.values():
        raw = bytes.fromhex(values.pop("rawHex"))
        assert values["sha256"] == hashlib.sha256(raw).hexdigest()
        assert len(raw) // 4 == values["words"]
        values["firmwareOffset"] = image.index(raw)
    return data


def read_cycles(log, names):
    rows = {name: {} for name in names}
    clocks = set()
    for block, lane, units, cycles, hz in re.findall(r"^INDEXGUEST (\d+) (\w+) (\d+) (\d+) (\d+)\r?$", log, re.M):
        key = int(block)
        assert lane in rows and key not in rows[lane] and int(units) == 65536 and int(cycles) > 0
        rows[lane][key] = int(cycles) / int(units)
        clocks.add(int(hz))
    assert all(row.keys() == set(COUNTS) for row in rows.values()), "incomplete physical preview copy trial"
    assert len(clocks) == 1 and min(clocks) > 0
    return {"clock_hz": next(iter(clocks)), "cyclesPerUnit": {
        lane: lib["matched"](rows["base"], rows[lane], COUNTS) for lane in names if lane != "base"
    }}


def summarize(work):
    trial = json.loads((work / "physical.json").read_text())
    names = tuple(trial["compilers"])
    jobs = []
    for i, _boot in enumerate(trial["boots"], 1):
        completed = work / f"boot-{i}-complete.log"
        log = completed if completed.exists() else work / f"boot-{i}.log"
        jobs.append(read_cycles(log.read_text(errors="replace"), names))
    return {"firmware": trial["firmware"], "kernels": kernels(work),
            "coldCompileAndControlGuests": lib["summarize"](trial), "previewCopy": jobs}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    args = parser.parse_args()
    print(json.dumps(summarize(args.work.resolve()), indent=2))
