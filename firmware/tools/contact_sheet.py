#!/usr/bin/env python3
"""Lay PNG captures out on one sheet, labelled with their file names: tools/contact_sheet.py OUT.png COLS SCALE FILE..."""
import sys
from PIL import Image, ImageDraw
out, cols, scale, files = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4:]
ims = [Image.open(f).convert("RGB") for f in files]
w, h = int(ims[0].width * scale), int(ims[0].height * scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + 12) + 12, rows * (h + 34) + 12), (200, 200, 196))
d = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = 12 + (i % cols) * (w + 12), 12 + (i // cols) * (h + 34)
    sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y + 22))
    d.text((x, y + 4), f.split("/")[-1], fill=(20, 20, 20))
sheet.save(out)
