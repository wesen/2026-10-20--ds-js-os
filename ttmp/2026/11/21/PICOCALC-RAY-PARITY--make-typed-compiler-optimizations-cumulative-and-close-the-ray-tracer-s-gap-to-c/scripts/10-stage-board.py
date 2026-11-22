"""Stage and build the paired P4 ray/shadow/Chess benchmark for a list of RV32 compile modes.

usage (repo root, ESP-IDF 5.4.2 exported):
    python3 10-stage-board.py BUILD_DIR MODES.json PIN_SHA256 [--internal-work-last]

--internal-work-last: the last mode's Typed frame arm gets a work buffer allocated in internal
RAM (MALLOC_CAP_INTERNAL) instead of PSRAM. The C frame keeps its trace on the stack in internal
RAM either way; predicates and Chess keep the PSRAM buffer. With the last mode's options equal to
mode 0's, the paired comparison measures where the work buffer lives, and nothing else.

MODES.json is a list of complete option objects; mode 0 is the control and its ray image
must have SHA-256 PIN_SHA256 (an image already timed on the board). Chess evaluation is
timed for mode 0 and the last mode only (bench.c's transfer()).

Generalizes 06-stage-board.py. Like it, this reuses PICOCALC-SHADOW-CODEGEN's harness
(bench.c, cold.c, layout.inc, 02-build.sh, 01-images.mjs with its opts and pin replaced).
cold.c's options buffer is widened from 180 to 1024 bytes; at 180 it truncated long
option strings (Step 5 lost 12 cold-compile rows that way).
"""
from pathlib import Path
import json, shutil, subprocess, sys

ticket = Path(__file__).resolve().parents[1]
shadow = next(ticket.parent.glob("PICOCALC-SHADOW-CODEGEN--*"))
src = shadow / "scripts/board"
build = Path(sys.argv[1]).resolve()
modes = json.loads(Path(sys.argv[2]).read_text())
pin = sys.argv[3]
internal_work_last = sys.argv[4:] == ["--internal-work-last"]
assert sys.argv[4:] in ([], ["--internal-work-last"])
assert isinstance(modes, list) and len(modes) >= 2 and len(pin) == 64
stage = build / "study"
stage.mkdir(parents=True, exist_ok=True)

text = (src / "01-images.mjs").read_text()
text = text.replace("../validation/holdout.mjs", (shadow / "scripts/validation/holdout.mjs").as_uri())
a = text.index("const here="); b = text.index("const out=", a)
text = text[:a] + "const ticket=" + json.dumps(str(shadow)) + ", root=" + json.dumps(str(ticket.parents[4])) + ";\n" + text[b:]
a = text.index("const opts="); b = text.index("const asm=", a)
text = text[:a] + "const opts=" + json.dumps(["(" + json.dumps(m) + ")" for m in modes]) + ";\n" + text[b:]
old_pin = "9a4a2356a86beee281fb79dcc199bc2369b819ef9b0a5f5c28d444ff4719f26f"
assert text.count(old_pin) == 1
(stage / "01-images.mjs").write_text(text.replace(old_pin, pin))
cold = (src / "cold.c").read_text()
assert cold.count("char cell[180];snprintf(cell,sizeof(cell),") == 1
(stage / "cold.c").write_text(cold.replace("char cell[180];", "char cell[1024];"))
for name in ["layout.inc", "02-build.sh"]:
    shutil.copy(src / name, stage / name)
bench = (src / "bench.c").read_text()
if internal_work_last:
    def patch(old, new):
        global bench
        assert bench.count(old) == 1, old
        bench = bench.replace(old, new)
    patch("static int frames(int count,", "static Surf *wint;\nstatic int frames(int count,")
    patch("w->cap=2048;memset(w->cells,0,4096);w->cells[0]=c->stride;",
          "Surf *wv=a==NMODE?wint:w;wv->cap=2048;memset(wv->cells,0,4096);wv->cells[0]=c->stride;")
    patch("ok=cleans[a-1](rgb,w,", "ok=cleans[a-1](rgb,wv,")
    patch("ok=primarys[a-1](z,id,w,", "ok=primarys[a-1](z,id,wv,")
    patch("ok=shades[a-1](rgb,z,id,w,", "ok=shades[a-1](rgb,z,id,wv,")
    patch("Native *nat=psram(sizeof(*nat));",
          "wint=heap_caps_aligned_alloc(64,sizeof(Surf)+2*(2048+1),MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT);\n"
          "    if(!wint){puts(\"SHERROR internal work\");goto finish;}\n    Native *nat=psram(sizeof(*nat));")
(stage / "bench.c").write_text(bench)
subprocess.run(["bash", str(stage / "02-build.sh"), str(build)], check=True)
