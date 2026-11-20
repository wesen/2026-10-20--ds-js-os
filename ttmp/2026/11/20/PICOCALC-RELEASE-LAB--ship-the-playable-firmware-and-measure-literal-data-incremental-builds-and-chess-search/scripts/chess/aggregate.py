"""Build an article-ready aggregate from the matched host, model and board receipts."""
import argparse
import json
from pathlib import Path
from statistics import median


def load(path):
    return json.loads(path.read_text())


def distribution(values):
    return [round(min(values), 3), round(median(values), 3), round(max(values), 3)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("host", "modeled", "physical", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    host, model, physical = map(load, (args.host, args.modeled, args.physical))
    assert host["digest"] == model["digest"] == physical["digest"]
    assert host["rv32Sha256"] == model["rv32Sha256"] == physical["rv32Sha256"]
    rows = []
    for index, row in enumerate(host["expected"]):
        measured = physical["rows"][index]
        wasm = [value["wallNs"] / 1000 for value in row["samples"]]
        p4 = [value["wallUs"] for value in measured]
        result = row["result"]
        if result["completed"] == row["depth"]:
            stop = "depth"
        elif abs(result["score"]) >= 29900:
            stop = "mate"
        else:
            assert result["nodes"] == row["budget"]
            stop = "budget"
        rows.append({
            "position":row["name"], "depth":row["depth"], "budget":row["budget"],
            "stop":stop, "result":result,
            "hostWallUsMinMedianMax":distribution(wasm), "p4WallUsMinMedianMax":distribution(p4),
            "p4MaxSliceUs":max(value["maxSliceUs"] for value in measured),
            "modelInstructions":model["instructions"][index],
            "p4MedianUsPerNode":round(median(p4) / result["nodes"], 2),
            "hostMedianUsPerNode":round(median(wasm) / result["nodes"], 3),
            "modelInstructionsPerNode":round(model["instructions"][index] / result["nodes"], 2),
        })
    table = {"digest":host["digest"], "engineSourceSha256":host["engineSourceSha256"],
             "rv32Sha256":host["rv32Sha256"], "wasmBytes":host["wasmBytes"], "rv32Bytes":host["rv32Bytes"],
             "hostCpu":host["host"], "node":host["node"], "v8":host["v8"], "hostRepeats":host["repeats"],
             "board":physical["measurement"], "boardRepeats":physical["measurement"]["repeats"],
             "perftGate":host["perftGate"], "sliceInvarianceSteps":host["sliceInvarianceSteps"],
             "rows":rows}
    args.output.write_text(json.dumps(table, indent=2) + "\n")


if __name__ == "__main__":
    main()
