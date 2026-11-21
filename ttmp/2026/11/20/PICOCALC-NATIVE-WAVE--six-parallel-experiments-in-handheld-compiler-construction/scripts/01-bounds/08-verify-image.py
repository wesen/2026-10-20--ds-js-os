"""Check that the linked flash text contains the exact five host-qualified positive images."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys

elf, app, outputs, receipt = map(Path, sys.argv[1:])
arms = ("stock", "bounds-order", "bounds-selected", "semantics-late", "semantics-selected")
symbols = subprocess.check_output(["riscv32-esp-elf-objdump", "-t", elf], text=True)
addresses = {row.split()[-1]: int(row.split()[0], 16) for row in symbols.splitlines()
             if row.strip() and row.split()[-1] in
             {k.replace("-","_")+"_repeated" for k in arms}}
data = app.read_bytes()
assert data[0] == 0xe9
segments = []
offset = 24
for _ in range(data[1]):
    vma, length = struct.unpack_from("<II", data, offset)
    offset += 8
    segments.append((vma, data[offset:offset + length]))
    offset += length
rows = {}
for arm in arms:
    prefix = outputs / ("positive-"+arm)
    qualified = prefix.with_suffix(".bin").read_bytes()
    meta = json.loads(prefix.with_suffix(".json").read_text())
    base = addresses[arm.replace("-","_")+"_repeated"] - meta["entries"]["repeated"]
    [(start, blob)] = [(a,b) for a,b in segments if a<=base and base+len(qualified)<=a+len(b)]
    payload = blob[base-start:base-start+len(qualified)]
    assert qualified == payload, arm
    rows[arm] = {"vma": hex(base), "size":len(payload), "sha256":hashlib.sha256(payload).hexdigest()}
    assert rows[arm]["sha256"] == meta["imageSHA256"]
receipt.write_text(json.dumps(rows,indent=2)+"\n")
