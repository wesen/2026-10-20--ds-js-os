"""Check the linked ELF32 function symbols against the native compiler output."""
import hashlib
import json
from pathlib import Path
import struct
import sys

work = Path(sys.argv[1])
manifest = json.loads((work / "manifest.json").read_text())
data = (work / "build/files_compare_cycles.elf").read_bytes()
assert data[:6] == b"\x7fELF\x01\x01"
shoff, = struct.unpack_from("<I", data, 32)
stride, count = struct.unpack_from("<HH", data, 46)
sections = [struct.unpack_from("<10I", data, shoff + stride * i) for i in range(count)]
symbols = {}
addresses = {}
for _, kind, _, _, offset, size, link, _, _, entsize in sections:
    if kind != 2:
        continue
    strings = sections[link]
    for at in range(offset, offset + size, entsize):
        name, addr, length, _, _, section = struct.unpack_from("<IIIBBH", data, at)
        name_start = strings[4] + name
        symbol = data[name_start:data.index(b"\x00", name_start)]
        if symbol not in (b"compare_old", b"compare_next"):
            continue
        sec = sections[section]
        assert sec[2] & 4 and addr % 4 == 0
        addresses[symbol.decode()] = addr
        start = sec[4] + addr - sec[3]
        symbols[symbol.decode()] = (length, hashlib.sha256(data[start:start + length]).hexdigest())
assert addresses["compare_old"] % 64 == addresses["compare_next"] % 64
for label in ("old", "next"):
    lane = manifest[label]
    assert symbols["compare_" + label] == (lane["bytes"], lane["sha256"])
binary = work / "build/files_compare_cycles.bin"
print("Matched both linked function symbols to the compiled source.")
print("Application:", binary, "SHA-256:", hashlib.sha256(binary.read_bytes()).hexdigest())
