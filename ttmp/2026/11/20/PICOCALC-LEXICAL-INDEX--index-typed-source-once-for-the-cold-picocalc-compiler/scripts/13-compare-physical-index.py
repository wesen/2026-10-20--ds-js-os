"""Summarize complete physical cold-build controls for the lexical study."""
import argparse
import hashlib
import json
from pathlib import Path
from statistics import median


def read(path):
    return json.loads(path.read_text())


def restored(path):
    result = read(path)
    if not result["restored"] or set(result["worlds"]) != {"files", "agenda", "editor"}:
        raise ValueError(f"incomplete hardware restoration in {path}")
    if any(w["engine"] != "native" or w["last_error"] for w in result["worlds"].values()):
        raise ValueError("original worlds failed to start")
    return result


def summarize(rows):
    if len(rows) != 3 or any(r["us"] <= 0 or r["peak"] <= 0 or r["bytes"] != 240452 for r in rows):
        raise ValueError("expected three native Editor cold compiles of the fixed-slot module")
    return {key: {"samples": [r[key] for r in rows], "median": median(r[key] for r in rows)}
            for key in ("us", "peak", "bytes")}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("work", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--composed",action="store_true",help="include the subsequent indexed body and span trials")
    a = p.parse_args()
    index = restored(a.work/"index-cold/physical.json")
    arms = {}
    for label, lane in (("manual", "pre-g"), ("async", "candidate-final")):
        control = restored(a.work/lane/"board/physical.json")
        if control["original"] != index["original"]:
            raise ValueError("factory image changed between controls")
        trials = [r["compiles"][-1] for r in control["trials"] if r["engine"] == "rv32"]
        arms[label] = summarize([dict(us=r["us"], peak=r["peak_js_bytes"], bytes=r["module_bytes"]) for r in trials])
    candidates = [("index","native-index-final",index),("index-reuse","native-index-reuse",index)]
    if a.composed:
        extra = restored(a.work/"async-index-cold/physical.json")
        if extra["original"]!=index["original"]: raise ValueError("different factory firmware")
        candidates.extend([("indexed-prepass","native-index-prepass",extra),("indexed-spans","native-index-span",extra)])
    for name, lane, run in candidates:
        receipt = run["lanes"][name]
        firmware = a.work/lane/"fixed-wall/rv32/picocalc-os-p4.bin"
        digest = hashlib.sha256(firmware.read_bytes()).hexdigest()
        if digest != receipt["image_sha256"]:
            raise ValueError("candidate source or firmware mismatch")
        arms[name] = summarize(receipt["boots"])
        arms[name]["image_sha256"] = digest
        arms[name]["staged_sources"] = read(a.work/lane/"staged.json")
    ceiling = arms["manual"]["us"]["median"] * 1.1
    for label, _, _ in candidates:
        arm = arms[label]
        time = arm["us"]["median"]
        arm["change_from_async_percent"] = 100*(time / arms["async"]["us"]["median"] - 1)
        arm["distance_from_gate_us"] = time - ceiling
        arm["passes_cold_gate"] = time <= ceiling
    a.output.write_text(json.dumps(dict(ceiling_us=ceiling, arms=arms), indent=2) + "\n")


if __name__ == "__main__":
    main()
