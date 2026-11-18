"""Keep a compact flash/boot/restore audit beside the per-experiment raw UART transcripts."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("series", type=Path)
parser.add_argument("image", type=Path)
parser.add_argument("control", type=Path)
parser.add_argument("name")
parser.add_argument("dest", type=Path)
args = parser.parse_args()
stage = "candidate" if args.name == "native" else "probe"
sections = []
receipts = []
for folder, image in ((stage, args.image), ("restored", args.control)):
    phase = args.series / folder
    flash = (phase / "flash.log").read_text()
    boot = (phase / "boot.log").read_text(errors="replace")
    assert "Hash of data verified" in flash and "keyboard/power I2C and display SPI offline" in boot
    assert "cji: idle" in boot and all(f"bus {bus}" in boot for bus in ("i2c0", "spi2"))
    row = json.loads((phase / "p4-runs.jsonl").read_text())
    assert row["verified"] and row["firmware_sha256"] == digest(image / "picocalc-os-p4.elf")
    assert row["elf_sha256"] == "e74d83cd6c8ebebf9319e5314f8f03818fb74c8954af2f58b23a005530d5f595"
    for file in ("before.log","flash.log","boot.log","flaky-8-1.log","p4-runs.jsonl"):
        sections.append(f"\n### {folder}/{file}\n".encode() + (phase/file).read_bytes())
    receipts.append({"stage":folder, "app_bin":digest(image/"picocalc-os-p4.bin"),
                     "firmware_elf":row["firmware_sha256"], "flaky_elf":row["elf_sha256"],
                     "flaky_elapsed_ms":row["elapsed_ms"]})
(args.dest / f"{args.name}-flash-smoke.log.gz").write_bytes(gzip.compress(b"".join(sections),mtime=0))
(args.dest / f"{args.name}-flash-smoke.json").write_text(json.dumps(receipts, indent=2)+"\n")
