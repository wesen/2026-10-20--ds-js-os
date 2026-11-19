#!/usr/bin/env python3
"""Compare the retained build outputs for the two Files firmware backends."""
import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rv32", type=Path, help="directory with saved RV32 build outputs")
    parser.add_argument("wasm", type=Path, help="directory with saved Wasm build outputs")
    args = parser.parse_args()
    builds = {"wasm": args.wasm, "native": args.rv32}
    for file in ("sdkconfig", "partition-table.bin"):
        if (args.rv32 / file).read_bytes() != (args.wasm / file).read_bytes():
            raise SystemExit(f"build configurations differ in {file}")
    for name in ("system.typed-files.json", "system.typed-agenda.json"):
        catalogs = []
        for engine, build in builds.items():
            catalog = json.loads((build / name).read_text())
            files = [world for world in catalog["worlds"] if world["name"] == "files"]
            if len(files) != 1 or files[0].pop("engine") != engine:
                raise SystemExit(f"{build / name} does not select the expected Files engine")
            catalogs.append(catalog)
        if catalogs[0] != catalogs[1]:
            raise SystemExit(f"catalogs differ outside the Files engine in {name}")
        print(f"{name} matches outside the Files engine ({len(catalogs[0]['worlds'])} worlds)")
    for engine, build in builds.items():
        image = (build / "picocalc-os-p4.bin").read_bytes()
        print(f"{engine}: {len(image)} bytes, sha256 {hashlib.sha256(image).hexdigest()}")


if __name__ == "__main__":
    main()
