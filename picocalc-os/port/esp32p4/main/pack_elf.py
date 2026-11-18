"""Pack a trusted firmware ELF for flash. port_read_file restores the ELF before relocation."""
import struct
import sys
import zlib
from pathlib import Path

source, destination = map(Path, sys.argv[1:])
elf = source.read_bytes()
if not elf.startswith(b"\x7fELF"):
    raise ValueError(f"{source} is not an ELF module")
destination.write_bytes(struct.pack("<4sI", b"CJIZ", len(elf)) + zlib.compress(elf, 9))
