"""Compile native Snake as a production unit. Check its event transcript and old game positions."""
import argparse
import json
import shlex
import subprocess
import tempfile
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--update", action="store_true", help="write the matched native transcript to the current golden")
args = p.parse_args()
root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
cji = root / "cji"
golden = cji / "tests/native/snake.out"
relative = golden.relative_to(root).as_posix()
old = subprocess.check_output(["git", "show", "e339b6a:" + relative], cwd=root, text=True)
events = (cji / "tests/native/snake.events").read_text().splitlines()
with tempfile.TemporaryDirectory(prefix="snake-native-") as temp:
    base = Path(temp)
    own, linked, elf = [base / f for f in ("snake.own.slir", "snake.slir", "snake.so")]
    def emit(command, dest):
        with dest.open("wb") as out:
            subprocess.run(command, cwd=cji, check=True, stdout=out)
    emit(["node", "cji.js", root / "picocalc-os/js" / events[0], "--world-unit", "--emit"], own)
    emit(["node", "tools/link-units.mjs", "build/rv32/unit/prelude-unit.slir", own], linked)
    subprocess.run(["./slas-rv32", "-c", elf, "--module", "--extern", "build/rv32/unit/unit.list", linked], cwd=cji, check=True)
    event_args = [x for event in events[1:] for x in shlex.split(event)]
    run = subprocess.run(["build/rv32/rv32emu", "build/rv32/fw-nw-units.elf", elf, "--", "NW_SELF=snake", "NW_MEM=1", *event_args],
                         cwd=cji, text=True, capture_output=True)
    if run.returncode:
        raise SystemExit(f"RV32 exited {run.returncode}\n{run.stdout}\n{run.stderr}")
    result = [s for s in run.stdout.splitlines() if not s.startswith(("rv32emu: ", "fw: "))]
original = old.splitlines()
assert len(result) == len(original)
screens = 0
for before, after in zip(original, result):
    if not before.startswith("screen "):
        assert before == after, (before, after)
        continue
    frame, hints = before.removeprefix("screen ").split(" | ", 1)
    semantic, new_hints = after.removeprefix("screen ").split(" | ", 1)
    assert hints == new_hints
    ops = json.loads(frame)["kids"][1]["ops"]
    cells = [(op[2]-1)//13*22 + (op[1]-1)//13 for op in ops[:-2]]
    food = (ops[-1][2]-1)//13*22 + (ops[-1][1]-1)//13
    assert json.loads(semantic) == {"t":"snake","v":1,"body":list(reversed(cells)),"food":food,
                                    "score":0,"best":0,"alive":True,"auto":False}
    screens += 1
text = "\n".join(result)+"\n"
if args.update:
    golden.write_text(text)
else:
    assert golden.read_text() == text
print(f"{screens} native snapshots matched the old golden's game positions, hints and kernel actions")
