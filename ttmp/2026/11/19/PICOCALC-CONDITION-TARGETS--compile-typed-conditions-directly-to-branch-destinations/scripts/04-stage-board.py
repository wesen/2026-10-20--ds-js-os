#!/usr/bin/env python3
"""Stage the established matched-lane P4 trial with the A5 compiler as the control."""
import argparse
from pathlib import Path
import runpy

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent


def stage(output, lanes):
    original, = DAY.glob("PICOCALC-COMPILER-LAB--*/scripts/01-stage.py")
    shared = runpy.run_path(str(original))["stage"]
    # The historical trial uses a production frontend and backend as its
    # reference. This trial intentionally replaces both with the pinned A5/A6 pair.
    root = next(iter(lanes.values()))
    shared.__globals__["frozen"] = lambda path: (
        root / "typed" / (Path(path).name.removeprefix("typed-"))
    ).read_bytes()
    shared(output, lanes)
    main = output / "tree/picocalc-os/port/esp32p4/main"
    live = list(lanes)[-1]
    trial = main / "lab_trials.c"
    text = trial.read_text()
    original_marker = "lab_front=fronts[0]; lab_back=backs[0];"
    assert text.count(original_marker) == 1
    text = text.replace(original_marker, "lab_front=fronts[LANES-1]; lab_back=backs[LANES-1];")
    for field in ("wasm", "rv32"):
        text = text.replace(f'"exp/base/{field}.js"', f'"exp/{live}/{field}.js"')
    trial.write_text(text)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("lanes", nargs="+", help="ordered name=path/to/directory/with/typed")
    args = parser.parse_args()
    lanes = {}
    for item in args.lanes:
        name, directory = item.split("=", 1)
        if name in lanes:
            parser.error("each lane name must be unique")
        lanes[name] = Path(directory).resolve()
    stage(args.output.resolve(), lanes)
