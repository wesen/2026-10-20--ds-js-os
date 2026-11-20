"""Validate completed P4 serial captures and report matched frontend measurements."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
from statistics import median

HERE = Path(__file__).resolve().parent
STAGE = runpy.run_path(str(HERE / "01-stage.py"))
PHASES = STAGE["PHASES"]
VARIANTS = ("base", "cursor", "base_trace", "cursor_trace")
APPS = ("files", "agenda", "editor")
ORDER = ((0, 1, 3, 2), (1, 2, 0, 3), (2, 3, 1, 0), (3, 0, 2, 1))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse(log, oracle):
    expected = [
        (block, pos, VARIANTS[index], app)
        for block, order in enumerate(ORDER)
        for pos, index in enumerate(order)
        for app in APPS
    ]
    rows = []
    worlds = None
    row = None
    streamed = False
    completed = False
    for line in log.splitlines():
        if line.startswith("FRONT begin "):
            assert row is None and len(rows) < len(expected), line
            _, _, block, position, variant, app = line.split()
            assert (int(block), int(position), variant, app) == expected[len(rows)], line
            row = dict(block=int(block), position=int(position), variant=variant, app=app, phases={})
            streamed = False
        elif line.startswith("FRONT failed "):
            raise ValueError(line)
        elif line == "FRONT complete":
            assert row is None and len(rows) == len(expected)
            completed = True
        elif line.startswith('[{"name":'):
            values = {item["name"]: item for item in json.loads(line)}
            worlds = {app: {key: values[app][key] for key in ("file", "last_error", "engine")} for app in APPS}
        elif row is not None:
            app = row["app"]
            if line == app + " native compiler functions=streamed":
                streamed = True
            elif line.startswith("FRONTPHASE "):
                _, phase_app, index, visits, us, heap = line.split()
                assert phase_app == app and int(index) == len(row["phases"]), line
                row["phases"][PHASES[int(index)]] = dict(visits=int(visits), us=int(us), peak=int(heap))
            elif line.startswith(app + " compile source="):
                match = re.fullmatch(r"\w+ compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)", line)
                assert match and "us" not in row, line
                row.update(zip(("us", "peak", "bytes"), map(int, match.groups())))
            elif line.startswith("FRONT end "):
                _, _, variant, reported_app, sha = line.split()
                assert (variant, reported_app) == (row["variant"], app) and streamed and row["us"] > 0 and row["peak"] > 0
                want = oracle["outputs"][app][variant]
                assert (row["bytes"], sha) == (want["bytes"], want["sha256"]), line
                phases = row["phases"]
                if variant.endswith("_trace"):
                    assert list(phases) == list(PHASES)
                    assert sum(p["us"] for p in phases.values()) == row["us"]
                    assert max(p["peak"] for p in phases.values()) == row["peak"]
                    assert phases["lower"]["visits"] and phases["match"]["visits"] == phases["token"]["visits"]
                    assert phases["parse"]["visits"] == 1 + phases["match"]["visits"] + phases["lower"]["visits"]
                else:
                    assert not phases
                row.update(sha256=sha, instruction_bytes=want["instructionBytes"])
                rows.append(row)
                row = None
    assert completed and worlds
    for app, world in worlds.items():
        assert world == {"engine": "native", "file": app + "/compiled.bin", "last_error": ""} or (
            world["engine"] == "native" and world["file"] == app + "/compiled.bin" and not world["last_error"]
        ), (app, world)
    return dict(rows=rows, worlds=worlds)


def summarize(rows):
    summaries = {}
    for app in APPS:
        blocks = [
            {r["variant"]: r for r in rows if r["app"] == app and r["block"] == b}
            for b in range(len(ORDER))
        ]
        row = {}
        pairs = {
            "cursor_minus_base_us": ("cursor", "base", "us"),
            "cursor_minus_base_peak": ("cursor", "base", "peak"),
            "base_trace_overhead_us": ("base_trace", "base", "us"),
            "cursor_trace_overhead_us": ("cursor_trace", "cursor", "us"),
        }
        for key, (a, b, field) in pairs.items():
            paired = [block[a][field] - block[b][field] for block in blocks]
            row[key] = dict(samples=paired, median=median(paired))
        row["variants"] = {
            variant: dict(
                median_us=median(b[variant]["us"] for b in blocks),
                max_peak=max(b[variant]["peak"] for b in blocks),
                phases_median_us={p: median(b[variant]["phases"][p]["us"] for b in blocks) for p in blocks[0][variant]["phases"]},
            )
            for variant in VARIANTS
        }
        summaries[app] = row
    return summaries


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("work", type=Path)
    p.add_argument("oracle", type=Path)
    p.add_argument("logs", type=Path, nargs="+")
    args = p.parse_args()
    oracle = json.loads(args.oracle.read_text())
    compilers = json.loads((args.work / "compilers.json").read_text())
    firmware_path = args.work / "build/picocalc-os-p4.bin"
    firmware = firmware_path.read_bytes()
    for name in VARIANTS:
        for path, sha in compilers["variants"][name].items():
            script = args.work / "lanes" / name / path
            assert digest(script) == sha
            assert script.read_bytes() in firmware, (name, path)
    boots = []
    for file in args.logs:
        boot = parse(file.read_text(errors="replace"), oracle)
        boot.update(log=file.name, sha256=digest(file), summary=summarize(boot["rows"]))
        boots.append(boot)
    print(json.dumps(dict(firmware_sha256=digest(firmware_path), compilers=compilers, oracle=oracle, boots=boots), indent=2))


if __name__ == "__main__":
    main()
