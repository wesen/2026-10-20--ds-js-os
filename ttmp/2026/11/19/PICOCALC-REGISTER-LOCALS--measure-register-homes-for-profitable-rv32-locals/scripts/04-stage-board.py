#!/usr/bin/env python3
"""Stage a three-lane A7 board image and add a checked Editor search kernel."""
import argparse
from pathlib import Path
import runpy
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("a7", type=Path)
    args = parser.parse_args()
    output, a7 = args.output.resolve(), args.a7.resolve()
    recipe, = DAY.glob("PICOCALC-CONDITION-TARGETS--*/scripts/04-stage-board.py")
    stage = runpy.run_path(str(recipe))["stage"]
    stage(output, {name: a7 / "lanes" / source for name, source in
                   (("base", "a6"), ("uses", "uses"), ("loops", "loops"))})
    subprocess.run(["node", HERE / "05-editor-guest.mjs", output, a7], check=True)
    main = output / "tree/picocalc-os/port/esp32p4/main"
    trial = main / "lab_trials.c"
    text = trial.read_text()
    marker = 'char *p4_editor_compile(size_t *length)'
    assert text.count(marker) == 1
    text = text.replace(marker, (HERE / "06-editor-guest.c").read_text() + "\n" + marker)
    marker = 'if (!guest()) { puts("LABFAIL guest"); return NULL; }'
    assert text.count(marker) == 1
    trial.write_text(text.replace(marker, marker.replace("!guest()", "!guest() || !editor_guest()")))
