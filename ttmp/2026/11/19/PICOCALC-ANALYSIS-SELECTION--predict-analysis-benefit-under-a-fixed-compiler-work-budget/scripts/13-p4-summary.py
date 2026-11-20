"""Validate phase accounting and calculate matched physical selector costs."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from statistics import median, quantiles

PHASES = ("setup", "dispatch", "features", "ordering", "native")
FIELDS = ("us", "start", "peak", "allocations")
COUNTERS = ("cells", "comparisons", "retained", "proof")
LIMITS = {"files": (1_700_000, 2 * 1024**2), "agenda": (1_700_000, 2 * 1024**2),
          "editor": (6_000_000, 4 * 1024**2), "synthetic": (6_000_000, 4 * 1024**2)}


def parse_phases(log, rows, preflight):
    output = []
    current = None
    for line in log.splitlines():
        if line.startswith("LABRUN "):
            assert current is None, line
            _, block, position, lane, app = line.split()
            current = dict(block=int(block), position=int(position), lane=lane,
                           app=app, phases={}, work={})
        elif current and line.startswith("SELSTAT "):
            _, app, index, *values = line.split()
            assert current["app"] == app
            phase = PHASES[int(index)]
            assert phase not in current["phases"]
            current["phases"][phase] = dict(zip(FIELDS, map(int, values), strict=True))
        elif current and line.startswith("SELWORK "):
            _, app, *values = line.split()
            assert current["app"] == app and not current["work"]
            current["work"] = dict(zip(COUNTERS, map(int, values), strict=True))
        elif line.startswith("LABHASH "):
            _, lane, app, digest = line.split()
            assert current is not None and (current["lane"], current["app"]) == (lane, app)
            measurement = rows[len(output)]
            assert all(current[key] == measurement[key] for key in ("block", "position", "lane", "app"))
            assert digest == measurement["sha256"]
            phases = current["phases"]
            work = current["work"]
            assert tuple(phases) == PHASES and set(work) == set(COUNTERS)
            assert sum(r["us"] for r in phases.values()) == measurement["us"]
            assert max(r["peak"] for r in phases.values()) == measurement["peak"]
            assert all(r["peak"] >= r["start"] for r in phases.values())
            duration, heap = LIMITS[app]
            assert 0 < measurement["us"] < duration and 0 < measurement["peak"] < heap
            if lane == "base":
                assert work["cells"] == work["comparisons"] == work["retained"] == 0
                assert all(not any(phases[name].values()) for name in ("features", "ordering"))
            else:
                assert phases["features"]["us"] > 0 and phases["ordering"]["us"] > 0
                assert work["retained"] > 0
            expected = preflight["selection"][lane].get(app)
            if expected:
                assert expected["sha256"] == digest and expected["words"] == measurement["words"]
                for field in ("cells", "retained", "proof"):
                    assert work[field] == expected["counters"][field]
                assert bool(work["comparisons"]) == bool(expected["counters"]["comparisons"])
            output.append({**measurement, "phases": phases, "work": work})
            current = None
    assert current is None and len(output) == len(rows)
    return output


def desc(values):
    q25, _, q75 = quantiles(values, n=4, method="inclusive")
    return dict(n=len(values), median=median(values), min=min(values), max=max(values),
                q25=q25, q75=q75, positive=sum(x > 0 for x in values))


def metrics(measure):
    totals = {field: measure[field] for field in ("us", "peak")}
    for phase, row in measure["phases"].items():
        for field in (*FIELDS, "growth"):
            totals[f"{phase}_{field}"] = row[field] if field != "growth" else row["peak"] - row["start"]
    return totals


def summarize(boots, apps, lanes):
    result = {}
    for app in apps:
        pairs = []
        for boot in boots:
            rows = [r for r in boot["rows"] if r["app"] == app]
            assert Counter((r["lane"], r["position"]) for r in rows) == {
                (lane, position): 2 for lane in lanes for position in range(len(lanes))
            }
            pairs.append([{r["lane"]: metrics(r) for r in rows if r["block"] == block}
                          for block in range(2 * len(lanes))])
        fields = tuple(pairs[0][0]["base"])
        result[app] = {}
        all_blocks = [block for boot in pairs for block in boot]
        for field in fields:
            result[app][field] = {
                "lanes": {lane: desc([row[lane][field] for row in all_blocks]) for lane in lanes},
                "delta": {lane: desc([row[lane][field] - row["base"][field] for row in all_blocks])
                          for lane in lanes if lane != "base"},
                "by_boot": [{lane: desc([row[lane][field] - row["base"][field] for row in blocks])
                             for lane in lanes if lane != "base"} for blocks in pairs],
            }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--excerpts", type=Path)
    args = parser.parse_args()
    work = args.work.resolve()
    verified = json.loads((work / "transfer-preflight.json").read_text())
    measured = json.loads((work / "physical.json").read_text())
    assert measured["restored"] and len(measured["boots"]) == 2
    assert measured["firmware"] == verified["firmware"]
    assert measured["compilers"] == verified["compilers"]
    if args.excerpts:
        args.excerpts.mkdir(parents=True, exist_ok=True)
    boots = []
    for index, boot in enumerate(measured["boots"], 1):
        complete = work / f"boot-{index}-complete.log"
        log = complete if complete.exists() else work / f"boot-{index}.log"
        raw = log.read_bytes()
        text = raw.decode(errors="replace")
        rows = parse_phases(text, boot["rows"], verified)
        if args.excerpts:
            app_prefix = tuple(app + " " + label for app in LIMITS
                               for label in ("native compiler functions=", "compile source="))
            excerpts = "\n".join(line for line in text.splitlines()
                                 if line.startswith(("LAB", "SEL", *app_prefix))) + "\n"
            assert parse_phases(excerpts, boot["rows"], verified) == rows
            (args.excerpts / f"boot-{index}.log.gz").write_bytes(
                gzip.compress(excerpts.encode(), mtime=0))
        boots.append({**boot, "rows": rows, "serialSha256": hashlib.sha256(raw).hexdigest()})
    apps = tuple(measured["oracle"]["base"])
    names = tuple(measured["compilers"])
    all_results = {key: measured[key] for key in ("firmware", "table", "original",
                                                  "compilers", "restored_worlds")}
    all_results["boots"] = boots
    all_results["summary"] = summarize(boots, apps, names)
    print(json.dumps(all_results, indent=2))


if __name__ == "__main__":
    main()
