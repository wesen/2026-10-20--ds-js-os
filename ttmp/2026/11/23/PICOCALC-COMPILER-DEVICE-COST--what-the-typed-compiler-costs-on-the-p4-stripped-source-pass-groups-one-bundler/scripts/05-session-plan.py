#!/usr/bin/env python3
"""Write the typedcost plan of the in-image session (05-session-2-plan.json) for 04-typedcost-session.py.

The plan is a list of blocks; 04 holds the serial lock for one block at a time, so other agents can use the board
between blocks. Every block starts by setting the knobs it needs (strip, park) and filling the bytecode cache, so
it does not depend on the block before it, or on a reboot between blocks.

E1a, E1b  strip modes 0, 1, 2 (none, JS_STRIP_SOURCE, JS_STRIP_DEBUG) per app, arena parking on (production);
          every command empties the bytecode cache, so compile 0 parses every compiler source (cold) and compile 1
          reads the bytecode (warm). Orders 012 (E1a) and 210 (E1b).
E2        the lazy pass groups against every group evaluated before the call (typed/rv32-all.js), warm, alternating,
          unstripped and without parking: PICOCALC-TYPED-PIPELINE's condition. One warm-up compile per arm.
E2p       E2 with arena parking on: does parking remove what E2 finds?
E3        the compile's heap moved by a PSRAM block held across it (pad KB), unstripped, lazy, no parking.
E2b       lazy against all in production (strip 2, parking on).
E4        arena parking off and on, strip 2, warm, alternating, three pairs per app.
"""
import json
from pathlib import Path

APPS = ["agenda", "files", "editor", "chess", "candela"]
blocks = []


def block(name, commands):
    blocks.append({"name": name, "commands": commands})


for name, order in (("E1a", [0, 1, 2]), ("E1b", [2, 1, 0])):
    block(name, [f"typedcost {app} 2 strip={s} park=1 flush" for app in APPS for s in order])


def lazy_all(strip, park, apps, reps):
    commands = [f"typedcost agenda 1 strip={strip} park={park} flush"]
    for app in apps:
        commands += [f"typedcost {app} 1 backend=lazy", f"typedcost {app} 1 backend=all"]
        for rep in range(reps):
            arms = ["lazy", "all"] if rep % 2 == 0 else ["all", "lazy"]
            commands += [f"typedcost {app} 2 backend={arm}" for arm in arms]
    return commands


block("E2", lazy_all(0, 0, ["agenda", "chess", "candela"], 3))
block("E2p", lazy_all(0, 1, ["agenda", "chess", "candela"], 3))
pads = [0, 1, 3, 8, 64, 1024]
e3 = ["typedcost agenda 1 strip=0 park=0 flush", "typedcost chess 1"]
for rep in range(2):
    for app in ["agenda", "chess"]:
        e3 += [f"typedcost {app} 1 pad={pad}" for pad in (pads if rep == 0 else pads[::-1])]
block("E3", e3)
block("E2b", lazy_all(2, 1, ["agenda", "chess"], 2))
e4 = ["typedcost agenda 1 strip=2 park=1 flush"]
for app in APPS:
    e4.append(f"typedcost {app} 1 park=1")
    for rep in range(3):
        arms = [0, 1] if rep % 2 == 0 else [1, 0]
        e4 += [f"typedcost {app} 2 park={arm}" for arm in arms]
block("E4", e4)
out = Path(__file__).with_name("05-session-2-plan.json")
out.write_text(json.dumps(blocks, indent=1) + "\n")
print(len(blocks), "blocks,", sum(len(b["commands"]) for b in blocks), "commands ->", out.name)
