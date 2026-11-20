"""Pack the frozen list fixtures for the ESP32-P4 component."""
import json
from pathlib import Path
import struct
import sys

poses, out = map(Path, sys.argv[1:])
rows = json.loads((poses / "receipt.json").read_text())["cases"]
assert len(rows) == 51
with (out / "fixtures.bin").open("wb") as stream:
    for row in rows:
        name = row["name"]
        assert len(name) < 16
        words = (poses / (name + ".words")).read_bytes()
        stream.write(name.encode().ljust(16, b"\0"))
        stream.write(struct.pack("<I", len(words) // 2))
        stream.write(words)
        if len(words) % 4:
            stream.write(b"\0\0")
