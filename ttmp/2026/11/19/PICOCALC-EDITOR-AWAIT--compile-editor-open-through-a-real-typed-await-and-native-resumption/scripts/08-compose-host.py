#!/usr/bin/env python3
"""Layer the real Editor await source and its linker adapter onto another compiler."""
import argparse
import json
from pathlib import Path
import runpy
import shutil

HERE = Path(__file__).resolve().parent


def compose(output, study, combined):
    shared = runpy.run_path(str(HERE / "01-stage.py"))
    await_linker, sha = shared["await_linker"], shared["sha"]
    old = study / "lanes/await"
    lane = output / "lanes/await"
    shutil.copytree(combined, lane / "typed")
    for source in ("world.typed", "editor.typed", "typed/async.js"):
        shutil.copyfile(old / source, lane / source)
    world = lane / "typed/world.js"
    world.write_text(await_linker(world.read_text()))
    fingerprints = {part.stem:sha(part.read_bytes()) for part in sorted((lane / "typed").glob("*.js"))}
    (output / "inputs.json").write_text(json.dumps({"lanes":{"await":{
        "sourceSha256":sha((lane / "world.typed").read_bytes()), "compiler":fingerprints}},
        "baseCompiler":{part.stem:sha(part.read_bytes()) for part in sorted(combined.glob("*.js"))}}, indent=2)+"\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    names = ("output", "study", "combined")
    for key in names:
        parser.add_argument(key, type=Path)
    args = parser.parse_args()
    compose(*(getattr(args, key).resolve() for key in names))
