"""Build the opening-exchange pixel oracle from the real host Chess replay."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
import zlib

from oracle import hint_strip, raster, small_font

REPLAY_FRAMES = {"e2": 0, "selected": 7, "e3-ready": 8, "e4-ready": 9, "white": 10, "reply": 12}
STRIDE = 4 + 180 + 4 + 8192
ROOT = Path(__file__).resolve().parents[7]


def extract(fixtures, index):
    start = index * STRIDE
    assert struct.unpack_from("<I", fixtures, start)[0] == 90
    cells = struct.unpack_from("<90H", fixtures, start + 4)
    count, = struct.unpack_from("<I", fixtures, start + 184)
    return cells, fixtures[start + 188:start + 188 + count * 2]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("poses", type=Path)
    p.add_argument("output", type=Path)
    a = p.parse_args()
    fixtures = (a.poses / "fixtures.bin").read_bytes()
    font = small_font(ROOT / "picocalc-os/nucleus/font_data.h")
    a.output.mkdir(parents=True, exist_ok=True)
    rows = {}
    for name, index in REPLAY_FRAMES.items():
        cells, commands = extract(fixtures, index)
        board = cells[:64]
        masks = cells[64:72]
        fields = struct.unpack("<9i", struct.pack("<18H", *cells[72:]))
        body, hints = raster(commands, font)
        app = body + hint_strip(hints, font)
        (a.output / (name + ".rgb565")).write_bytes(app)
        rows[name] = {"frameIndex": index, "board": "".join(format(c, "x") for c in board),
                      "legalMasks": "".join(format(c, "02x") for c in masks), "fields": fields,
                      "pixelBytes": len(app), "crc32": f"{zlib.crc32(app):08x}",
                      "appSha256": sha256(app).hexdigest()}
    boards = [rows[name]["board"] for name in ("e2", "white", "reply")]
    differences = [[(index, start, end) for index, (start, end) in enumerate(zip(a, b)) if start != end]
                   for a, b in zip(boards, boards[1:])]
    assert differences == [[(36, "0", "1"), (52, "1", "0")], [(1, "a", "0"), (18, "0", "a")]]
    assert rows["selected"]["legalMasks"] == "0000000010100000"
    assert rows["white"]["fields"] == (36, 64, 52, 36, 6, 0, 0, 0, 0)
    assert rows["reply"]["fields"] == (37, 64, 1, 18, 0, 0, 3, 1600, 12)
    (a.output / "reference.json").write_text(json.dumps(rows, indent=2) + "\n")
    print("Host reference from real replay verifies White e2e4 and Black b8c6")


if __name__ == "__main__":
    main()
