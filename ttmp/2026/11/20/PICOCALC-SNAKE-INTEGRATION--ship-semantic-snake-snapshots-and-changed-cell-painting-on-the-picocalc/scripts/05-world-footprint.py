"""Compare the paired production native worlds and the two playable firmware images."""

import argparse
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("before", type=Path, help="baseline ESP-IDF build directory")
p.add_argument("after", type=Path, help="candidate ESP-IDF build directory")
args = p.parse_args()
worlds = Path("esp-idf/main/natives")
paths = [
    worlds / (name + ext)
    for name in ("snake", "compositor")
    for ext in (".elf", ".elf.z")
]
paths.append(Path("picocalc-os-p4.bin"))
rows = {}
for name in paths:
    observations = {}
    for arm, root in (("before", args.before), ("after", args.after)):
        data = (root / name).read_bytes()
        observations[arm] = {
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
    rows[name.as_posix()] = observations
print(json.dumps(rows, indent=2))
