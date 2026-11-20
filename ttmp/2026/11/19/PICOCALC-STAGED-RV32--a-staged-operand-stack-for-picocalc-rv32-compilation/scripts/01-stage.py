#!/usr/bin/env python3
"""Materialize frozen compiler bundles and the cumulative native-lowering ablations."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

CONTROL = "40bcf850a5809ef6d839127869faa952596ed157"
HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
REPO = DAY.parents[3]
FEATURES = ("SHORT_BRANCHES", "LAZY_OPERANDS", "LEAF_FRAMES", "LAZY_RETURNS")
STAGES = ("short", "operands", "leaf", "staged")


def frozen(path):
    return subprocess.check_output(["git", "show", f"{CONTROL}:{path}"], cwd=REPO)


def patch(path, source):
    subprocess.run(["patch", "--quiet", "--batch", "--fuzz=0", path],
                   input=source.read_bytes(), check=True)


def stage(work):
    lanes = work / "lanes"
    base = lanes / "base"
    (base / "typed").mkdir(parents=True)
    for part in ("wasm", "rv32", "world"):
        (base / "typed" / f"{part}.js").write_bytes(frozen(f"picocalc-os/compiler/typed-{part}.js"))
    source_root = work / "sources"
    app_parts = {"files": ["files.typed"], "agenda": ["reminder.typed", "entry.typed"],
                 "editor": frozen("picocalc-os/worlds/editor/source.list").decode().splitlines()}
    for app, parts in app_parts.items():
        (source_root / app).mkdir(parents=True)
        inputs = [frozen(f"picocalc-os/worlds/{app}/{part}") for part in parts]
        source = b"\n".join(inputs)
        if app == "editor":
            source += b"\n"
        (source_root / app / "app.typed").write_bytes(source)
    fusion = lanes / "fusion"
    shutil.copytree(base, fusion)
    fusion_patch, = DAY.glob("PICOCALC-RV32-BRANCH--*/scripts/02-predicate-fusion.patch")
    patch(fusion / "typed/rv32.js", fusion_patch)
    hashes = {}
    for number, name in enumerate(STAGES, 1):
        lane = lanes / name
        shutil.copytree(fusion, lane)
        backend = lane / "typed/rv32.js"
        patch(backend, HERE / "02-staged-lowering.patch")
        text = backend.read_text()
        for feature in FEATURES[number:]:
            key = feature + " = true"
            assert text.count(key) == 1
            text = text.replace(key, feature + " = false")
        backend.write_text(text)
    for lane in ("base", "fusion", *STAGES):
        data = (lanes / lane / "typed/rv32.js").read_bytes()
        hashes[lane] = {"sha256": hashlib.sha256(data).hexdigest(), "sourceBytes": len(data)}
    (work / "compilers.json").write_text(json.dumps({"control": CONTROL, "lanes": hashes}, indent=2) + "\n")
    pair = work / "pair"
    pair.mkdir()
    for name, lane in [("baseline", "base"), ("candidate", "staged")]:
        (pair / name).symlink_to(lanes / lane, target_is_directory=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    stage(parser.parse_args().work.resolve())
