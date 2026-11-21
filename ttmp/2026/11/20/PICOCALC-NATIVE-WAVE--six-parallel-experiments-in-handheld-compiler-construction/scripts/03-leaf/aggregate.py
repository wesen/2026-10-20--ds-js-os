"""Join full-case model instruction counts with optional fixed-work P4 timings."""
import argparse
import json
from pathlib import Path
from statistics import median

ARMS = ("stock", "leaf", "inline")


def load(path):
    return json.loads(path.read_text())


def spread(values):
    return [round(min(values), 3), round(median(values), 3), round(max(values), 3)]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("work", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--physical", type=Path)
    a = p.parse_args()
    host = load(a.work / "host-check.json")
    reference = load(a.work / "main/host.json")
    models = {arm:load(a.work / arm / "modeled.json") for arm in ARMS}
    assert all(row["digest"] == reference["digest"] for row in models.values())
    outputs = {"oracleDigest":reference["digest"], "heldOut":host["heldOut"],
               "adversarialChecks":host["adversarialChecks"], "compile":{}, "painterPhases":host["painter"]["render"]}
    for workload in ("chess", "painter"):
        outputs["compile"][workload] = {
            arm:{"bytes":row["bytes"],"compileMsMinMedianMax":spread(row["compileMs"]),"stats":row["stats"]}
            for arm,row in host[workload]["compiles"].items()}
    outputs["chessModel"] = [
        {"position":row["name"],"depth":row["depth"],"budget":row["budget"],"result":row["result"],
         "instructions":{arm:models[arm]["instructions"][i] for arm in ARMS}}
        for i,row in enumerate(reference["expected"])]
    if a.physical:
        physical = load(a.physical)
        assert physical["observations"] == 45 and physical["restoreReadback"]
        assert physical["oracleDigest"] == reference["digest"]
        assert all(physical["armBuilds"][arm]["rv32Sha256"] == models[arm]["rv32Sha256"] for arm in ARMS)
        physical_rows = []
        for row in physical["rows"]:
            timings = {arm:[observation["wallUs"] for observation in row["arms"][arm]] for arm in ARMS}
            control = timings["stock"]
            reductions = {arm:round(median(
                100 * (before - after) / before for before,after in zip(control, timings[arm], strict=True)), 3)
                for arm in ARMS[1:]}
            physical_rows.append({"case":row["case"],"fixture":row["fixture"],
                                  "depth":row["depthRequested"],"budget":row["budget"],
                                  "wallUsMinMedianMax":{arm:spread(timings[arm]) for arm in ARMS},
                                  "medianPairedElapsedReductionPct":reductions})
        outputs["physical"] = {"cpuHz":physical["cpuHz"],"observations":45,"repeats":3,"rows":physical_rows}
    a.output.write_text(json.dumps(outputs,indent=2)+"\n")


if __name__ == "__main__":
    main()
