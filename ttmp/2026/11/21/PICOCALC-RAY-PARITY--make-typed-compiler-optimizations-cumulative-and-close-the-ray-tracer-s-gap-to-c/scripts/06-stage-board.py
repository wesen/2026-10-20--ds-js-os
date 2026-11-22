"""Stage and build the paired P4 ray/shadow/Chess benchmark for four RV32 compile modes.

usage (repo root, ESP-IDF 5.4.2 exported): python3 06-stage-board.py BUILD_DIR

Reuses the PICOCALC-SHADOW-CODEGEN board harness (bench.c, cold.c, layout.inc, 02-build.sh),
as PICOCALC-OPERAND-HOMES did, with these modes:
  0  previous default + pie-empty  (image 2e33bb64…, timed by OPERAND-HOMES at 46.05 ms)
  1  candidate default + pie-empty (adds saved homes and direct reads)
  2  previous default
  3  candidate default
Every mode spells out all fields, so the result does not depend on what "default" means.
"""
from pathlib import Path
import json, shutil, subprocess, sys

ticket = Path(__file__).resolve().parents[1]
shadow = next(ticket.parent.glob("PICOCALC-SHADOW-CODEGEN--*"))
src = shadow / "scripts/board"
build = Path(sys.argv[1]).resolve()
stage = build / "study"
stage.mkdir(parents=True, exist_ok=True)

previous = {"forward": True, "capacity": True, "homes": True}
candidate = {"forward": True, "capacity": True, "homes": True, "saved": True, "direct": True}
modes = [
    {"pieLoops": "pie-empty", "inlineGuardedReturns": True, "operandLocations": previous},
    {"pieLoops": "pie-empty", "inlineGuardedReturns": True, "operandLocations": candidate},
    {"inlineGuardedReturns": True, "operandLocations": previous},
    {"inlineGuardedReturns": True, "operandLocations": candidate},
]

text = (src / "01-images.mjs").read_text()
text = text.replace("../validation/holdout.mjs", (shadow / "scripts/validation/holdout.mjs").as_uri())
a = text.index("const here="); b = text.index("const out=", a)
text = text[:a] + "const ticket=" + json.dumps(str(shadow)) + ", root=" + json.dumps(str(ticket.parents[4])) + ";\n" + text[b:]
a = text.index("const opts="); b = text.index("const asm=", a)
text = text[:a] + "const opts=" + json.dumps(["(" + json.dumps(m) + ")" for m in modes]) + ";\n" + text[b:]
old_digest = "9a4a2356a86beee281fb79dcc199bc2369b819ef9b0a5f5c28d444ff4719f26f"
assert old_digest in text
text = text.replace(old_digest, "2e33bb648fd24dc470769ef92cb72be3a793cf4a8de4e964cbbed273b91684ac")
(stage / "01-images.mjs").write_text(text)
for name in ["bench.c", "layout.inc", "cold.c", "02-build.sh"]:
    shutil.copy(src / name, stage / name)
(ticket / "various").mkdir(exist_ok=True)
(ticket / "various/07-board-modes.json").write_text(json.dumps(modes, indent=1) + "\n")
subprocess.run(["bash", str(stage / "02-build.sh"), str(build)], check=True)
