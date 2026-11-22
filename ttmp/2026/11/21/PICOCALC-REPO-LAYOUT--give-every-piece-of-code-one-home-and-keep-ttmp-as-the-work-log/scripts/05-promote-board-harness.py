#!/usr/bin/env python3
"""Phase A (board part): the paired ESP32-P4 ray/predicate/Chess/cold-compile study harness, promoted to bench/board.

usage: python3 05-promote-board-harness.py        (runs once)

Sources: PICOCALC-SHADOW-CODEGEN scripts/board/{bench.c,cold.c,layout.inc} and scripts/validation/holdout.mjs, and
PICOCALC-SIMD-LAB scripts/ray/board/{CMakeLists.txt,main/CMakeLists.txt,sdkconfig.defaults}, the ESP-IDF project
around them. RAY-PARITY's 10-stage-board.py patched two things into the copies at every use; both become parameters:
- cold.c's options buffer (char cell[180], widened to 1024 by RAY-PARITY after it truncated long option strings):
  the complete compile expression of each mode is now data in cold_inputs.h (cells[]), so its length is unbounded;
- --internal-work-last (the last mode's Typed frame arm with its work buffer in internal RAM): bench.c reads
  INTERNAL_WORK_LAST, which stage.mjs defines in inputs.h from the study's "internalWorkLast".
"""
import glob, subprocess
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
T = lambda t: Path(glob.glob(str(REPO / "ttmp/2026/11/21" / (t + "--*")))[0])
SHADOW, SIMD = T("PICOCALC-SHADOW-CODEGEN") / "scripts", T("PICOCALC-SIMD-LAB") / "scripts/ray/board"
APP = REPO / "bench/board/app"
(APP / "main").mkdir(parents=True, exist_ok=True)

def promote(src, dest, edits=(), comment="/* {} */\n"):
    text = src.read_text()
    for old, new in edits:
        assert text.count(old) == 1, (src.name, old)
        text = text.replace(old, new)
    rel = src.relative_to(REPO)
    note = f"Promoted from {rel.parts[4].split('--')[0]} {'/'.join(rel.parts[5:])} (PICOCALC-REPO-LAYOUT Phase A)."
    dest.write_text((comment.format(note) if comment else "") + text)

promote(SHADOW / "board/bench.c", APP / "main/bench.c", [
    ('#include "inputs.h"\n', '#include "inputs.h"\n#ifndef INTERNAL_WORK_LAST\n#define INTERNAL_WORK_LAST 0\n#endif\n'),
    ("static int frames(int count,", "// INTERNAL_WORK_LAST: the last mode's Typed frame arm gets its work buffer in internal RAM instead of PSRAM.\n"
                                    "static Surf *wint;\nstatic int frames(int count,"),
    ("w->cap=2048;memset(w->cells,0,4096);w->cells[0]=c->stride;",
     "Surf *wv=INTERNAL_WORK_LAST&&a==NMODE?wint:w;wv->cap=2048;memset(wv->cells,0,4096);wv->cells[0]=c->stride;"),
    ("ok=cleans[a-1](rgb,w,", "ok=cleans[a-1](rgb,wv,"),
    ("ok=primarys[a-1](z,id,w,", "ok=primarys[a-1](z,id,wv,"),
    ("ok=shades[a-1](rgb,z,id,w,", "ok=shades[a-1](rgb,z,id,wv,"),
    ("Native *nat=psram(sizeof(*nat));",
     "if(INTERNAL_WORK_LAST){\n        wint=heap_caps_aligned_alloc(64,sizeof(Surf)+2*(2048+1),MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT);\n"
     "        if(!wint){puts(\"SHERROR internal work\");goto finish;}\n    }\n    Native *nat=psram(sizeof(*nat));"),
], comment="// {}\n")
promote(SHADOW / "board/cold.c", APP / "main/cold.c", [
    ('char cell[180];snprintf(cell,sizeof(cell),"typedRv32.compile(input,[],undefined,%s).image",options[arm]);',
     "const char *cell=cells[arm];"),
], comment="// {}\n")
promote(SHADOW / "board/layout.inc", APP / "main/layout.inc", comment="// {}\n")
promote(SHADOW / "validation/holdout.mjs", REPO / "bench/board/chess-holdout.mjs", [
    ('const data=execFileSync("git",["show",revision+":"+path],{encoding:"utf8"});',
     'const data=execFileSync("git",["show",revision+":"+path],{encoding:"utf8",cwd:new URL("../..",import.meta.url).pathname});'),
], comment="// {}\n")
promote(SIMD / "CMakeLists.txt", APP / "CMakeLists.txt", comment="# {}\n")
promote(SIMD / "main/CMakeLists.txt", APP / "main/CMakeLists.txt", comment="# {}\n")
promote(SIMD / "sdkconfig.defaults", APP / "sdkconfig.defaults", comment="# {}\n")
print("promoted the board app into", APP.relative_to(REPO))
