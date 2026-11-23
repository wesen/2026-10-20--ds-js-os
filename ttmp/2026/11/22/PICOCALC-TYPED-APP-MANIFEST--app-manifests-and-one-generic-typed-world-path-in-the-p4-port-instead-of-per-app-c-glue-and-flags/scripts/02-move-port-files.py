#!/usr/bin/env python3
"""Delete the per-app compile glue and the source lists app.json replaces; move the console benchmarks out of the
port into bench/board/firmware. Dry run by default; --apply runs git rm / git mv. Asserts every file exists first
and that the counts are as planned.

usage (repository root): python3 ttmp/.../scripts/02-move-port-files.py [--apply]
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
MAIN = "firmware/port/esp32p4/main"
DELETE = [f"{MAIN}/{n}_p4.c" for n in ("agenda", "chess", "editor", "files")] + [
    "apps/typed/chess/source.list", "apps/typed/editor/source.list"]
MOVE = {
    f"{MAIN}/raybench_p4.c": "bench/board/firmware/raybench.c",
    f"{MAIN}/perf_p4.c": "bench/board/firmware/cachestat.c",
    f"{MAIN}/typed_ray_material_bench.c": "bench/board/firmware/typed_ray_material_bench.c",
}
assert len(DELETE) == 6 and len(MOVE) == 3
for p in DELETE + list(MOVE):
    assert (REPO / p).is_file(), f"{p}: missing"
for p in MOVE.values():
    assert not (REPO / p).exists(), f"{p}: already exists"
apply = "--apply" in sys.argv[1:]
for p in DELETE:
    print(("git rm " if apply else "would git rm ") + p)
    if apply:
        subprocess.run(["git", "rm", "-q", p], cwd=REPO, check=True)
for a, b in MOVE.items():
    print(("git mv " if apply else "would git mv ") + f"{a} {b}")
    if apply:
        (REPO / b).parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "mv", a, b], cwd=REPO, check=True)
if apply:
    for p in DELETE + list(MOVE):
        assert not (REPO / p).exists(), p
    for p in MOVE.values():
        assert (REPO / p).is_file(), p
print(f"{len(DELETE)} deleted, {len(MOVE)} moved" + ("" if apply else " (dry run)"))
