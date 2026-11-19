"""Fingerprint the cached host objects that predate the controlled fresh-build runs."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
objects = {}
with tempfile.TemporaryDirectory() as directory:
    stripped = Path(directory) / "stripped.o"
    for label in ("qjs", "eng"):
        objects[label] = {}
        for path in sorted((root / "picocalc-os/build" / label).glob("*.o")):
            subprocess.run(["objcopy", "--strip-debug", path, stripped], check=True)
            objects[label][path.name] = {
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "without_debug_sha256": hashlib.sha256(stripped.read_bytes()).hexdigest(),
            }
meaning = ("qjs are the existing object inputs used by the original cold and factorial runs. "
           "eng is the working host build at audit time. The qualified series uses a new temporary build.")
print(json.dumps({"meaning": meaning, "objects": objects}, indent=2))
