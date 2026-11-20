"""Score preregistered point forecasts against four paired compiler blocks on boot 2."""
import json
from pathlib import Path
from statistics import mean, median

HERE = Path(__file__).resolve().parent
PACKET = HERE.parent / "various/paired-review"
APPS = {"small":"files", "medium":"agenda", "large":"editor"}
METRICS = {"time_pct":"us", "heap_pct":"peak"}


def load(path):
    return json.loads(path.read_text())


def score(prediction, truth):
    absolute = {}
    directions = 0
    for size in APPS:
        for metric in METRICS:
            estimate = prediction[size][metric]
            answer = truth[size][metric]
            absolute.setdefault(metric, []).append(abs(estimate-answer))
            directions += (estimate > 0 and answer > 0 or estimate < 0 and answer < 0 or estimate == answer == 0)
    by_metric = {k:mean(v) for k,v in absolute.items()}
    return {"time_mae_pp":by_metric["time_pct"], "heap_mae_pp":by_metric["heap_pct"],
            "overall_mae_pp":mean(by_metric.values()), "correct_directions":directions}


def main():
    receipt, = HERE.parent.parent.glob("PICOCALC-RV32-COMBINED--*/various/physical.json")
    trial = load(receipt)
    assert len(trial["boots"]) == 2 and trial["original_restored"]
    truth, additive, zero = {}, {}, {}
    for size, app in APPS.items():
        truth[size], additive[size], zero[size] = {}, {}, {}
        for measure, field in METRICS.items():
            # Time figures in the frozen packet were rounded to whole microseconds.
            first = [r for r in trial["boots"][0]["rows"] if r["app"] == app]
            control,fusion,compact = (
                median(r[field] for r in first if r["lane"] == lane)
                for lane in ("base", "branch", "compact"))
            if field=="us":
                from decimal import Decimal, ROUND_HALF_UP
                control,fusion,compact=(float(Decimal(str(x)).quantize(Decimal(1),rounding=ROUND_HALF_UP))
                                        for x in (control,fusion,compact))
            additive[size][measure]=100*(fusion+compact-2*control)/control
            zero[size][measure]=0
            second = {(r["block"],r["lane"]):r[field] for r in trial["boots"][1]["rows"] if r["app"]==app}
            assert len(second)==16
            changes=[100*(second[b,"both"]-second[b,"base"])/second[b,"base"] for b in range(4)]
            truth[size][measure]=median(changes)
    estimates = {k:load(PACKET/(k+".json")) for k in ("sol","opus")}
    estimates.update(additive=additive, zero=zero)
    print(json.dumps({"truth":truth, "additive":additive, "scores":{k: score(v,truth) for k,v in estimates.items()}},indent=2))


if __name__=="__main__":
    main()
