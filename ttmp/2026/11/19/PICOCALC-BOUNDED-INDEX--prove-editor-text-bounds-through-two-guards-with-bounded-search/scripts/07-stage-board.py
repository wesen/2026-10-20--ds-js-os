#!/usr/bin/env python3
"""Stage the clean compiler lanes and the actual guarded preview copy routine."""
import argparse
import json
from pathlib import Path
import subprocess

from runpy import run_path

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
lib = run_path(str(HERE / "01-stage.py"))
lab_stage, = DAY.glob("PICOCALC-COMPILER-LAB--*/scripts/01-stage.py")
lab = lib["load"](lab_stage, "lab_stage")


def stage(work, output):
    current = work / "clean/current/typed"

    def baseline(path):
        name = Path(path).stem.removeprefix("typed-")
        return (current / f"{name}.js").read_bytes()

    lab.frozen = baseline
    lab.stage(output, {label: work / "clean" / mode for label, mode in
                       [("base", "current"), ("direct", "direct"), ("bounded", "bounded")]})
    source = work / "sources/editor/app.typed"
    main = output / "tree/picocalc-os/port/esp32p4/main"
    lab.replace(main / "CMakeLists.txt",
                '    file(CONFIGURE OUTPUT "${editor_source}" CONTENT "${editor_source_text}" @ONLY)',
                f'    configure_file("{source}" "${{editor_source}}" COPYONLY)')
    subprocess.run(["node", HERE / "08-copy-kernel.mjs", work, output], check=True)
    marker = "char *p4_editor_compile(size_t *length) {"
    lab.replace(main / "lab_trials.c", marker, (HERE / "09-copy-trial.c").read_text() + "\n" + marker)
    lab.replace(main / "lab_trials.c", '        puts("LABDONE");',
                '        if (!preview_copy()) { puts("LABFAIL preview-copy"); return NULL; }\n        puts("LABDONE");')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("output", type=Path)
    opts = parser.parse_args()
    stage(opts.work.resolve(), opts.output.resolve())
