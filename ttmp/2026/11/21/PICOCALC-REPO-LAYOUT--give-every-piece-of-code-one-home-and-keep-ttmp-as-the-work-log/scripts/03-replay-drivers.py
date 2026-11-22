#!/usr/bin/env python3
"""Phase A, third part: the three C drivers the replays compile, which 01 missed.

usage: python3 03-replay-drivers.py        (runs once, after 02-emulator-runtime.py)

files-rv32.mjs, editor-layout.mjs and agenda-entry-tokens.mjs compile a driver named relative to the script
(new URL('NN-name.c', import.meta.url)). The drivers are copied beside the promoted scripts under descriptive names
with a provenance line, and the scripts name them so.
"""
import glob, subprocess
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
T = lambda day, t: Path(glob.glob(str(REPO / "ttmp/2026/11" / day / (t + "--*")))[0]) / "scripts"
R = REPO / "bench/host/replays"
for ticket, day, src, dest, script in [
    ("PICOCALC-TYPED-APPS", "18", "02-files-rv32-driver.c", "files-rv32-driver.c", "files-rv32.mjs"),
    ("PICOCALC-TYPED-APPS", "18", "07-editor-layout-driver.c", "editor-layout-driver.c", "editor-layout.mjs"),
    ("PICOCALC-AGENDA-COMPILER", "18", "15-rv32-entry-runner.c", "agenda-entry-runner.c", "agenda-entry-tokens.mjs"),
]:
    text = (T(day, ticket) / src).read_text()
    (R / dest).write_text(f"/* Promoted from {ticket} scripts/{src} (PICOCALC-REPO-LAYOUT Phase A); run from the repository root. */\n" + text)
    p = R / script; s = p.read_text()
    assert s.count(f"'{src}'") == 1, (script, src)
    p.write_text(s.replace(f"'{src}'", f"'{dest}'"))
    print(src, "->", dest)
