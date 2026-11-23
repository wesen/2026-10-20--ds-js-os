#!/usr/bin/env python3
"""Remove various/05-compositor-soak-54cfa09b, the output of a soak that was stopped while it waited for the board lock.

usage (repository root): python3 ttmp/.../scripts/02-remove-empty-soak-dir.py [--apply]

Dry run by default. The directory must hold exactly one file, an empty samples.jsonl: nothing was captured.
"""
import shutil
import sys
from pathlib import Path

TICKET = Path(__file__).resolve().parents[1]
TARGET = TICKET / "various/05-compositor-soak-54cfa09b"

files = sorted(p for p in TARGET.rglob("*"))
assert [p.name for p in files] == ["samples.jsonl"], files
assert files[0].stat().st_size == 0, files[0]
print(f"remove {TARGET.relative_to(TICKET)}: {[p.name for p in files]} (all empty)")
if "--apply" in sys.argv:
    shutil.rmtree(TARGET)
    assert not TARGET.exists()
    print("removed")
else:
    print("dry run; pass --apply")
