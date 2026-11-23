#!/usr/bin/env python3
"""Move the native-world declarations of firmware/nucleus/nucleus.h (586 lines) to nucleus_native.h.

usage: python3 06-split-nucleus-h.py [--dry-run | --revert]       (on a clean tree)

nucleus.h includes nucleus_native.h exactly where the section was, so every file that includes nucleus.h sees the same
declarations in the same order; nothing else includes nucleus_native.h.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from splitlib import Part, split  # noqa: E402

N = "firmware/nucleus/"
NATIVE_HEAD = """// Native worlds (native.c): part of nucleus.h, which includes this file where the section belongs (after the
// engine binding, before the port). Include nucleus.h, not this file.
#pragma once
"""
PARTS = [
    Part(N + "nucleus.h", [(1, 354), (504, 586)], between={1: '#include "nucleus_native.h"   // native worlds (native.c)\n\n'}),
    Part(N + "nucleus_native.h", [(355, 503)], head=NATIVE_HEAD),
]
EDITS = {
    "firmware/Makefile": [("HDRS    := nucleus/nucleus.h ", "HDRS    := nucleus/nucleus.h nucleus/nucleus_native.h ", 2)],
}
split(N + "nucleus.h", PARTS, edits=EDITS)
