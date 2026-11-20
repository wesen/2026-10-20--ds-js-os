"""Quantify complete native invocation for the two raw arms of the packed-scene experiment."""
from argparse import ArgumentParser
import json
from pathlib import Path
from statistics import median

parser = ArgumentParser(description=__doc__)
parser.add_argument("receipt", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
physical = json.loads(args.receipt.read_text())
summary = {"unit": "P4 CPU cycles per native painter invocation", "samplesPerPosition": 11,
           "invocationsPerSample": 8, "positions": {}}
for name in ("e2", "e3", "f3"):
    screen = physical["screens"][name]
    pair = next(v for v in screen.values() if isinstance(v, dict) and "raw-pie" in v and "guarded-rv32" in v)
    scalar, pie = [pair[a]["samples"] for a in ("guarded-rv32", "raw-pie")]
    assert len(scalar) == len(pie) == 11
    diff = [s-p for s,p in zip(scalar,pie)]
    percent = [100*(s-p)/s for s,p in zip(scalar,pie)]
    summary["positions"][name] = {
        "scalarMedian": median(scalar), "pieMedian": median(pie),
        "pairedMedianCyclesSaved": median(diff), "pairedMedianPercentSaved": median(percent),
        "pairedMinPercentSaved": min(percent), "pairedMaxPercentSaved": max(percent),
        "pieFasterPairs": sum(p<s for s,p in zip(scalar,pie)),
        "commandWords":pair["scene"]["words"], "commandFNV":pair["scene"]["fnv"],
        "panelCRC":screen["panel"]["panelCRC"],
    }
args.output.write_text(json.dumps(summary,indent=2)+"\n")
