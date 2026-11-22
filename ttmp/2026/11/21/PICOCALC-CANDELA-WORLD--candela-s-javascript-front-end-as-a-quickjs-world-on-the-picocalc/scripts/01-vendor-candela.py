"""Copy Candela's front end and the T0 preset scenes into picocalc-os/third_party/candela, with a pin.

usage: python3 -I 01-vendor-candela.py ARCHIVE.zip EXTRACTED_ROOT TIERS_JSON DEST

EXTRACTED_ROOT is the archive's "candela" directory, extracted by hand into a new empty directory.
The script checks the archive's SHA-256, copies the 15 modules that src/candela.js imports (its
import closure, computed here from the import lines) and the scene file of every T0 preset, byte for
byte, and writes DEST/PIN.json with the SHA-256 of every copied file. It refuses to overwrite a
DEST that already holds files it did not write.
"""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ARCHIVE_SHA = "873b2dd4bb9c32cac08751baf9fa6960ee4377306a04b2e118a8969dd940df5d"
IMPORT = re.compile(r"""^\s*(?:import|export)\b[^'"\n]*?(?:from\s*)?['"](\./[\w.-]+\.js)['"]""", re.M)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def closure(src, entry):
    seen, todo = [], [entry]
    while todo:
        name = todo.pop(0)
        if name in seen:
            continue
        seen.append(name)
        for spec in IMPORT.findall((src / name).read_text()):
            todo.append(spec[2:])
    return seen


def main():
    archive, root, tiers_path, dest = map(Path, sys.argv[1:5])
    if sha(archive) != ARCHIVE_SHA:
        raise SystemExit(f"{archive}: unexpected SHA-256 {sha(archive)}")
    tiers = json.loads(tiers_path.read_text())
    t0 = tiers["byTier"][0]
    modules = closure(root / "src", "candela.js")
    presets = {}
    for md in sorted((root / "content/presets").glob("*.md")):
        m = re.search(r"^id:\s*(\S+)\s*$", md.read_text(), re.M)
        if m and m.group(1) in t0:
            scene = md.with_suffix(".js")
            if (root / "content/presets" / md.stem).is_dir():
                raise SystemExit(f"{md.stem}: T0 preset with a lib/ folder; extend this script")
            presets[m.group(1)] = scene
    if sorted(presets) != sorted(t0):
        raise SystemExit(f"T0 presets not found: {sorted(set(t0) - set(presets))}")
    pin_path = dest / "PIN.json"
    if dest.exists() and any(dest.iterdir()) and not pin_path.exists():
        raise SystemExit(f"{dest} holds files this script did not write")
    (dest / "src").mkdir(parents=True, exist_ok=True)
    (dest / "presets").mkdir(parents=True, exist_ok=True)
    pin = {"source": "candela-workspace(1).zip, the candela/ directory", "archiveSha256": ARCHIVE_SHA,
           "modules": {}, "presets": {}, "tier": "T0 of PICOCALC-CANDELA-P4 various/02-tiers.json"}
    for name in modules:
        shutil.copyfile(root / "src" / name, dest / "src" / name)
        pin["modules"][name] = sha(dest / "src" / name)
    for pid, scene in sorted(presets.items()):
        shutil.copyfile(scene, dest / "presets" / scene.name)
        pin["presets"][pid] = {"file": scene.name, "sha256": sha(dest / "presets" / scene.name)}
    pin_path.write_text(json.dumps(pin, indent=1) + "\n")
    print(f"{len(modules)} modules, {len(presets)} presets -> {dest}")


if __name__ == "__main__":
    main()
