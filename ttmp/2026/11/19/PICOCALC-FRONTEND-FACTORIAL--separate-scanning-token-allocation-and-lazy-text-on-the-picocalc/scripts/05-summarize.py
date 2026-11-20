"""Check physical receipts against preflight and calculate matched contrasts."""
import argparse
from collections import Counter
import json
from pathlib import Path
from statistics import median, quantiles

APPS = ("files", "agenda", "editor")
HEAP_LIMIT = {"files": 2 * 1024**2, "agenda": 2 * 1024**2, "editor": 4 * 1024**2}
TIME_LIMIT = {"files": 1_700_000, "agenda": 1_700_000, "editor": 6_000_000}
CONTRASTS = {
    "factorial": {
        "scanner_fresh": {"cursor_fresh": 1, "base": -1},
        "scanner_reuse": {"cursor_reuse": 1, "regex_reuse": -1},
        "reuse_regex": {"regex_reuse": 1, "base": -1},
        "reuse_cursor": {"cursor_reuse": 1, "cursor_fresh": -1},
        "scanner_average": {"cursor_fresh": .5, "base": -.5, "cursor_reuse": .5, "regex_reuse": -.5},
        "reuse_average": {"regex_reuse": .5, "base": -.5, "cursor_reuse": .5, "cursor_fresh": -.5},
        "interaction": {"cursor_reuse": 1, "regex_reuse": -1, "cursor_fresh": -1, "base": 1},
        "cursor_combined": {"cursor_reuse": 1, "base": -1},
    },
    "lazy": {
        "lazy_delta": {"cursor_lazy": 1, "cursor_reuse": -1},
        "lazy_combined": {"cursor_lazy": 1, "base": -1},
    },
}


def summary(values):
    low, _, high = quantiles(values, n=4, method="inclusive")
    return dict(n=len(values), median=median(values), q25=low, q75=high,
                min=min(values), max=max(values),
                negative=sum(x < 0 for x in values), positive=sum(x > 0 for x in values))


def verify_worlds(entries):
    assert set(entries) == set(APPS)
    for app, row in entries.items():
        assert row == {"engine": "native", "file": app + "/compiled.bin", "last_error": ""}


def summarize_image(path, name, preflight):
    physical = json.loads(path.read_text())
    expected = preflight["images"][name]
    assert physical["firmware"] == expected["firmware"]
    assert physical["original"] == preflight["factory"]
    assert physical["table"] == preflight["partition"]
    assert physical["compilers"] == expected["compilers"]
    assert physical["restored"]
    verify_worlds(physical["restored_worlds"])
    boots = physical["boots"]
    assert len(boots) == 2
    lanes = list(physical["compilers"])
    result = {}
    for app in APPS:
        by_boot = []
        for boot in boots:
            verify_worlds(boot["worlds"])
            rows = [r for r in boot["rows"] if r["app"] == app]
            positions = Counter((r["lane"], r["position"]) for r in rows)
            assert positions == {(lane, i): 2 for lane in lanes for i in range(len(lanes))}
            sample = {}
            for row in rows:
                assert row["streamed"] and row["sha256"] == expected["identities"][app]["elf"]
                assert row["bytes"] == expected["identities"][app]["elfBytes"]
                assert row["words"] == expected["identities"][app]["words"]
                assert 0 < row["us"] < TIME_LIMIT[app]
                assert 0 < row["peak"] <= HEAP_LIMIT[app]
                block = sample.setdefault(row["block"], {})
                assert row["lane"] not in block
                block[row["lane"]] = row
            assert set(sample) == set(range(2 * len(lanes)))
            for part in sample.values():
                assert set(part) == set(lanes)
            by_boot.append([sample[i] for i in sorted(sample)])
        metrics = {}
        for metric in ("us", "peak"):
            def aggregates(blocks):
                return {lane: summary([b[lane][metric] for b in blocks]) for lane in lanes}

            def contrasts(blocks):
                return {key: summary([
                    sum(b[lane][metric] * weight for lane, weight in coeff.items())
                    for b in blocks
                ]) for key, coeff in CONTRASTS[name].items()}

            all_blocks = [block for boot in by_boot for block in boot]
            metrics[metric] = {
                "lanes": aggregates(all_blocks),
                "matched": contrasts(all_blocks),
                "by_boot": [{"lanes": aggregates(boot), "matched": contrasts(boot)} for boot in by_boot],
            }
        metrics["lowest_heap_headroom"] = {
            lane: HEAP_LIMIT[app] - data["max"] for lane, data in metrics["peak"]["lanes"].items()
        }
        result[app] = metrics
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("preflight", type=Path)
    parser.add_argument("factorial", type=Path)
    parser.add_argument("lazy", type=Path)
    args = parser.parse_args()
    preflight = json.loads(args.preflight.read_text())
    results = {name: summarize_image(getattr(args, name), name, preflight) for name in CONTRASTS}
    cross_image = {app: {metric: {
        lane: results["lazy"][app][metric]["lanes"][lane]["median"]
        - results["factorial"][app][metric]["lanes"][lane]["median"]
        for lane in ("base", "cursor_reuse")
    } for metric in ("us", "peak")} for app in APPS}
    print(json.dumps({"results": results, "control_cross_image_median_difference": cross_image}, indent=2))


if __name__ == "__main__":
    main()
