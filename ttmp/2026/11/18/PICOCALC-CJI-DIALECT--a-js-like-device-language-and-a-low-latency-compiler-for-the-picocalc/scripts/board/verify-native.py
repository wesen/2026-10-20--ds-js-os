"""Verify the board emitted exactly the module built independently by the host candidate."""
import json
from pathlib import Path
import sys

expected = {
    "agenda": (330984, "19ac388cde229215547764869ca18c15e4c43f600539778c46455cee00d1fca3"),
    "files": (217176, "fedf1397b2ee65b57c6d1641c581f89461e4e0670817805467ee498abe8f7a28"),
}
for world, (size, digest) in expected.items():
    row = json.loads((Path(sys.argv[1]) / f"{world}.jsonl").read_text())
    assert row["result"] == "ok" and row["requested_heap_mib"] == 8, row
    assert (row["elf_bytes"], row["elf_sha256"]) == (size, digest), row
    print(f'{world} {size} {digest} {row["elapsed_ms"] / 1000} s')
