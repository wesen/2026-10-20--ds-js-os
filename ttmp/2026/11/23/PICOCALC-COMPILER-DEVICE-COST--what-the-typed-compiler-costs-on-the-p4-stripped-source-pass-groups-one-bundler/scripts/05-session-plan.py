#!/usr/bin/env python3
"""Write the typedcost plan of the in-image session (05-session-1-plan.json) for 04-typedcost-session.py.

E1  strip modes 0, 1, 2 (none, JS_STRIP_SOURCE, JS_STRIP_DEBUG) per app; every command empties the bytecode cache, so
    compile 0 parses every compiler source (cold) and compile 1 reads the bytecode (warm). Orders 012 and 210.
E2  the lazy pass groups against every group evaluated before the call (typed/rv32-all.js), unstripped as
    PICOCALC-TYPED-PIPELINE measured them, warm, alternating; one warm-up compile per arm parses its files.
E3  the compile's heap moved by a PSRAM block held across it (pad KB), unstripped and lazy.
E2b lazy against all with the production strip mode (2).
"""
import json
from pathlib import Path

APPS = ["agenda", "files", "editor", "chess", "candela"]
plan = []
for order in ([0, 1, 2], [2, 1, 0]):
    for app in APPS:
        plan += [f"typedcost {app} 2 strip={s} flush" for s in order]
plan.append("typedcost agenda 1 strip=0 flush")
for app in APPS:
    plan += [f"typedcost {app} 1 backend=lazy", f"typedcost {app} 1 backend=all"]
    for rep in range(3):
        arms = ["lazy", "all"] if rep % 2 == 0 else ["all", "lazy"]
        plan += [f"typedcost {app} 2 backend={arm}" for arm in arms]
for rep in range(2):
    for app in ["agenda", "chess"]:
        pads = [0, 1, 3, 8, 64, 1024]
        plan += [f"typedcost {app} 1 pad={pad}" for pad in (pads if rep == 0 else pads[::-1])]
plan.append("typedcost agenda 1 strip=2 flush")
for app in ["agenda", "chess"]:
    plan += [f"typedcost {app} 1 backend=lazy", f"typedcost {app} 1 backend=all"]
    for rep in range(2):
        arms = ["lazy", "all"] if rep % 2 == 0 else ["all", "lazy"]
        plan += [f"typedcost {app} 2 backend={arm}" for arm in arms]
out = Path(__file__).with_name("05-session-1-plan.json")
out.write_text(json.dumps(plan, indent=1) + "\n")
print(len(plan), "commands ->", out.name)
