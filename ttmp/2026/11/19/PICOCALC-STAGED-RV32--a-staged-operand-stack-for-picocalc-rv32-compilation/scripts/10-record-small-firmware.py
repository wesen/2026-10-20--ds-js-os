#!/usr/bin/env python3
"""Check presence of the expected compiler, reactor and post-timer receipt in firmware."""
import argparse
from hashlib import sha256
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("work", type=Path)
work = parser.parse_args().work.resolve()
build = work / "build"
files = {
    "firmware": build / "picocalc-os-p4.bin",
    "partitionTable": build / "partition_table/partition-table.bin",
    "standardModule": work / "editor-standard.elf",
    "smallModule": work / "editor-small.elf",
    "smallReactor": build / "esp-idf/main/typed-world-reactor.elf",
    "candidate": work / "tree/picocalc-os/compiler/typed-rv32.js",
}
data = {name: path.read_bytes() for name, path in files.items()}
firmware = data["firmware"]
assert data["candidate"] in firmware
assert data["smallReactor"] in firmware
assert b"SLOT80 editor bytes=%zu sha256=%s\n" in firmware
receipt = {name: {"bytes": len(blob), "sha256": sha256(blob).hexdigest()} for name, blob in data.items()}
receipt["confirmedCompilerAndSmallReactorInFirmware"] = True
receipt["confirmedPostTimerHashReceiptInFirmware"] = True
print(json.dumps(receipt, indent=2))
