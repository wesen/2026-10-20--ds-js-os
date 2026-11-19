"""Validate one complete UART run, then summarize matched P4 cycle counts."""
import argparse
import json
from pathlib import Path
import re
from statistics import median


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path)
    parser.add_argument("manifest", type=Path, help="build's manifest.json")
    args = parser.parse_args()
    lines = args.log.read_text(errors="replace").splitlines()
    runs = []
    current = []
    for line in lines:
        if "FCBENCH START " in line:
            current = []
        if "FCBENCH " in line:
            current.append(line[line.index("FCBENCH "):])
        if "FCBENCH COMPLETE" in line:
            runs.append(current)
            current = []
    if len(runs) != 1:
        raise ValueError(f"expected one complete benchmark boot, found {len(runs)}")
    run = runs[0]
    fields = lambda s: dict(re.findall(r"(\w+)=([\w.-]+)", s))
    meta, code = fields(run[0]), fields(run[1])
    manifest = json.loads(args.manifest.read_text())
    assert run[0].startswith("FCBENCH START ") and run[1].startswith("FCBENCH CODE ")
    assert not manifest["smoke"] and meta["smoke"] == "0"
    assert meta["old"] == manifest["old"]["revision"] and meta["new"] == manifest["next"]["revision"]
    assert int(meta["core"]) == 0 and int(meta["hz"]) > 0
    for label in ("old", "next"):
        assert int(code[label+"_fnv"], 16) == manifest[label]["fnv"]
        assert int(code[label+"_bytes"]) == manifest[label]["bytes"]
    repeats, blocks = int(meta["repeats"]), int(meta["blocks"])
    assert repeats == 128 and blocks == 16
    fixtures = {"equal91": 0, "late91": -31, "prefix": -20, "first": 7, "dir": -1}
    expected_hash = {}
    for name, value in fixtures.items():
        fnv = 2166136261
        for _ in range(repeats):
            fnv = ((fnv ^ value) * 16777619) & 0xffffffff
        expected_hash[name] = fnv
    assert len(run) == 3 + len(fixtures) * blocks
    result = {}
    for i, (name, _) in enumerate(fixtures.items()):
        old, new = [], []
        for block in range(blocks):
            line = run[2 + i*blocks + block]
            assert line.startswith("FCBENCH PAIR ")
            row = fields(line)
            assert row["case"] == name and int(row["block"]) == block
            assert row["first"] == ("new" if (i+block) % 2 else "old")
            assert int(row["hash"], 16) == expected_hash[name]
            a, b = int(row["old"]), int(row["new"])
            assert 0 < a < 2**32 and 0 < b < 2**32
            old.append(a)
            new.append(b)
        differences = [(a-b)/repeats for a,b in zip(old,new)]
        result[name] = {"old_cycles_per_call_median": median(old)/repeats,
            "new_cycles_per_call_median": median(new)/repeats,
            "paired_cycles_saved_per_call_median": median(differences),
            "paired_saving_percent_median": median(100*(1-b/a) for a,b in zip(old,new)),
            "candidate_faster_blocks": sum(x > 0 for x in differences), "blocks": blocks}
    print(json.dumps({"run":meta,"code":code,"fixtures":result}, indent=2))


if __name__ == "__main__":
    main()
