"""Compare repeated board workflows, preserving raw samples, image identity and clock definitions."""
import argparse
import hashlib
import json
from pathlib import Path
from statistics import median


def receipt(directory):
    data = json.loads((directory / "physical.json").read_text())
    if not data["restored"] or any(row.get("last_error") for row in data["worlds"].values()):
        raise ValueError(f"missing board restoration at {directory}")
    return data


def delta(before, after):
    left, right = median(before), median(after)
    return dict(before=before, after=after, before_median=left, after_median=right,
                delta=right-left, percent=(right/left-1)*100)


def engine_trials(directory):
    data = receipt(directory)
    for engine in ("rv32", "wasm"):
        trials = [trial for trial in data["trials"] if trial["engine"] == engine]
        if len(trials) != 3 or any(trial["workflow"] != "pass" for trial in trials):
            raise ValueError(f"expected three completed {engine} workflows in {directory}")
        for trial in trials:
            for name, digest in trial["shots"].items():
                path = directory / f"trial-{trial['trial']}" / engine / name
                if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                    raise ValueError(f"unexpected screenshot content at {path}")
        yield engine, trials


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("work", type=Path)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    work = args.work
    before_g = dict(engine_trials(work/"pre-g/board"))
    after_g = dict(engine_trials(work/"candidate/board"))
    original = dict(engine_trials(work/"control/board"))
    result = dict(workflow={}, gates={})
    for engine in before_g:
        before, after = before_g[engine], after_g[engine]
        measures = {}
        for key in ("us", "peak_js_bytes", "module_bytes"):
            measures[key] = delta([s["compiles"][-1][key] for s in before], [s["compiles"][-1][key] for s in after])
        measures["workflow_cpu_ms"] = delta([s["workflow_cpu_ms"] for s in before], [s["workflow_cpu_ms"] for s in after])
        measures["frame_sha256"] = {name: sorted({s["shots"][name] for s in before+after}) for name in before[0]["shots"]}
        result["gates"][engine+"_exact_frames"] = all(len(values) == 1 for values in measures["frame_sha256"].values())
        result["workflow"][engine] = measures
    result["gates"]["native_cpu_within_10pct"] = result["workflow"]["rv32"]["workflow_cpu_ms"]["percent"] <= 10
    result["gates"]["native_compile_within_10pct"] = result["workflow"]["rv32"]["us"]["percent"] <= 10
    e5 = receipt(work/"e5/board")["trials"]
    if len(e5) != 3:
        raise ValueError("expected three E5 cold native samples")
    result["e5_native_cold_us"] = delta([s["compiles"][-1]["us"] for s in original["rv32"]], [s["us"] for s in e5])
    result["gates"]["e5_native_within_5pct"] = result["e5_native_cold_us"]["percent"] <= 5
    args.output.write_text(json.dumps(result, indent=2)+"\n")


if __name__ == "__main__":
    main()
