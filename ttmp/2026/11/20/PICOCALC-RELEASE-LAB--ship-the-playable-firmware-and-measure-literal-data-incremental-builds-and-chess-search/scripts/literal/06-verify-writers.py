"""Verify that each measured compiled blob appears unchanged in the flash image."""
from hashlib import sha256
import json
from pathlib import Path
import struct
import subprocess
import sys

elf, app, manifest, output = map(Path, sys.argv[1:])
expected = json.loads(manifest.read_text())
symbols = subprocess.check_output(["riscv32-esp-elf-objdump", "-t", elf], text=True)
image = app.read_bytes()
assert image[0] == 0xe9
offset = 24
segments = []
for _ in range(image[1]):
    address, size = struct.unpack_from("<II", image, offset)
    segments.append((address, image[offset + 8:offset + 8 + size]))
    offset += 8 + size
results = {}
for line in symbols.splitlines():
    fields = line.split()
    if not fields or fields[-1] not in {"literal_" + name for name in expected}:
        continue
    address, _, _, section, size, symbol = fields
    assert section == ".flash.text"
    base, length = int(address, 16), int(size, 16)
    arm = symbol.removeprefix("literal_")
    [(start, data)] = [(a, b) for a, b in segments if a <= base and base + length <= a + len(b)]
    actual = sha256(data[base-start:base-start+length]).hexdigest()
    assert actual == expected[arm]["sha256"] and length == expected[arm]["totalBytes"]
    results[arm] = {"vma":base, "section":section, "size":length, "sha256":actual}
assert set(results) == set(expected)
output.write_text(json.dumps(results,indent=2) + "\n")
