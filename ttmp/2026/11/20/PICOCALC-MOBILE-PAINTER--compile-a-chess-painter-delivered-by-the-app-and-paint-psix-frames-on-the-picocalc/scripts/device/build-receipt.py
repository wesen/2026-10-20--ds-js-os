"""Identify the precise integration source, native worlds, generated unit and image."""
import argparse
from hashlib import sha256
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("work",type=Path)
p.add_argument("output",type=Path)
a=p.parse_args()
tree=a.work/"tree"
build=a.work/"build"
component=build/"esp-idf/main"
def manifest(base, paths):
    return {str(f.relative_to(base)): {"bytes":f.stat().st_size,"sha256":sha256(f.read_bytes()).hexdigest()}
            for f in sorted(set(paths)) if f.is_file()}

paths=[]
for path in ("cji/src/world-native.js","cji/src/prelude-exports.js","picocalc-os/js/system/compositor.js",
             "picocalc-os/compiler/typed-*.js","picocalc-os/compiler/mobile-painter.js","picocalc-os/nucleus/*painter*",
             "picocalc-os/nucleus/kernel.c","picocalc-os/nucleus/native.c","picocalc-os/nucleus/nucleus.h",
             "picocalc-os/sdk/nw*.h","picocalc-os/sdk/nw_calls.inc","picocalc-os/sdk/typed/*",
             "picocalc-os/worlds/chess/*.typed","picocalc-os/worlds/chess/source.list","picocalc-os/tools/embed-chess-painter.py",
             "picocalc-os/port/esp32p4/CMakeLists.txt","picocalc-os/port/esp32p4/main/CMakeLists.txt",
             "picocalc-os/port/esp32p4/main/*painter*","picocalc-os/port/esp32p4/main/*_p4.c","picocalc-os/port/esp32p4/main/p4.h"):
    paths.extend(tree.glob(path))
products=[build/"picocalc-os-p4.bin",build/"partition_table/partition-table.bin",build/"cji/unit.list",
          component/"natives/compositor.elf",component/"chess.typed",component/"mobile-painter-slot.elf",
          component/"typed-world-reactor.elf",component/"system.typed-agenda.json"]
a.output.write_text(json.dumps({"source":manifest(tree,paths),"products":manifest(build,products)},indent=2)+"\n")
