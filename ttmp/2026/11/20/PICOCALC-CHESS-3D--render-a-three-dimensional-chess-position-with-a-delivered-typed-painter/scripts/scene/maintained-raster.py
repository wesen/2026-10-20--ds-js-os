"""Raster the independent RGB565 reference and illustrate the six piece meshes."""
import argparse
from hashlib import sha256
import json
import math
from pathlib import Path
import struct

from PIL import Image, ImageDraw, ImageFont

from oracle import hint_strip, raster, small_font

ROOT = Path(__file__).resolve().parents[7]
NAMES = ("Pawn", "Knight", "Bishop", "Rook", "Queen", "King")


def rgb_image(body):
    pixels = bytearray()
    for color, in struct.iter_unpack("<H", body):
        pixels.extend(((color >> 11) * 255 // 31, ((color >> 5) & 63) * 255 // 63, (color & 31) * 255 // 31))
    return Image.frombytes("RGB", (320, 280), bytes(pixels))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("poses", type=Path)
    p.add_argument("output", type=Path)
    a = p.parse_args()
    a.output.mkdir(parents=True, exist_ok=True)
    font = small_font(ROOT / "picocalc-os/nucleus/font_data.h")
    receipt = json.loads((a.poses / "receipt.json").read_text())
    for row in receipt["cases"]:
        body, hints = raster((a.poses / (row["name"] + ".words")).read_bytes(), font)
        row["appSha256"] = sha256(body + hint_strip(hints, font)).hexdigest()
    for index in {row["index"] for row in receipt["cases"]}:
        assert len({row["appSha256"] for row in receipt["cases"] if row["index"] == index}) == 32

    sheet = Image.new("RGB", (576, 254), "#e8e3d6")
    draw = ImageDraw.Draw(sheet)
    text_font = ImageFont.truetype("DejaVuSans.ttf", 13)
    for row, phase in enumerate((0, 13)):
        radians = phase * math.pi / 16
        c, s = round(math.cos(radians) * 256), round(math.sin(radians) * 256)
        # The single-piece fixture puts every model at d5, or (56, 0, 56).
        center_x = 160 + math.trunc(16 * s / 256)
        center_y = 140 - math.trunc(80 * c / 2048)
        draw.text((7, 5 + row * 126), f"Phase {phase} · {phase * 11.25:g}°", fill="#203132", font=text_font)
        for i, name in enumerate(NAMES, 1):
            key = f"mesh-{i}-phase-{phase}.words"
            body, _ = raster((a.poses / key).read_bytes(), font)
            view = rgb_image(body).crop((center_x - 20, center_y - 34, center_x + 20, center_y + 8))
            x, y = (i - 1) * 96 + 7, row * 126 + 25
            sheet.paste(view.resize((80, 84), Image.Resampling.NEAREST), (x, y))
            draw.text((x, y + 85), name, fill="#203132", font=text_font)
    sheet.save(a.output / "piece-meshes.png", optimize=True)
    (a.output / "host-validation.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
