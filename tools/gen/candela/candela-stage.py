"""Stage a JS root for picocalc-host with the Candela world (PICOCALC-CANDELA-WORLD), for make CANDELA=1.

usage: python3 -I ../tools/gen/candela/candela-stage.py BUILD_DIR BUNDLE_TOOL     (from picocalc-os/)

Writes BUILD_DIR/candela-js: a copy of js/, the world's script as candela/world.js, Candela's bytecode bundle
candela/front.qbc (BUNDLE_TOOL --list worlds/candela-world/bundle.list .), and system.json with the world's
manifest entry (worlds/candela-world/manifest.json) appended. Run from picocalc-os/, as picocalc-os/Makefile's
candela target does; BUNDLE_TOOL is candela-bc.c, built by the same target. It replaces only a staging directory it
made itself (one with a .candela-stage marker), inside BUILD_DIR.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path


def main():
    build, tool = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    root = Path.cwd()
    if not (root / "worlds/candela-world/bundle.list").is_file():
        raise SystemExit("run from picocalc-os/")
    stage = build / "candela-js"
    if stage.exists():
        if not (stage / ".candela-stage").is_file() or build not in stage.parents:
            raise SystemExit(f"{stage} exists and was not made by this script; not removing it")
        shutil.rmtree(stage)
    shutil.copytree(root / "js", stage)
    (stage / ".candela-stage").write_text("made by tools/gen/candela/candela-stage.py\n")
    (stage / "candela").mkdir()
    shutil.copyfile(root / "worlds/candela-world/main.js", stage / "candela/world.js")
    manifest = json.loads((root / "js/system.json").read_text())
    manifest["worlds"].append(json.loads((root / "worlds/candela-world/manifest.json").read_text()))
    (stage / "system.json").write_text(json.dumps(manifest, indent=1) + "\n")
    subprocess.run([str(tool), str(stage / "candela/front.qbc"), "--list", "worlds/candela-world/bundle.list", "."], check=True)


if __name__ == "__main__":
    main()
