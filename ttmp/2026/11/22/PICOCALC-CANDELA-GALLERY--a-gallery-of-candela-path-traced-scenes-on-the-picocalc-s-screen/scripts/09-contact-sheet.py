#!/usr/bin/env python3
"""09-contact-sheet.py: the device's screen captures of every scene on one sheet, with the scene's passes and time.

usage: python3 -I 09-contact-sheet.py RUN_DIR OUT.png [--cols 6] [--scale 0.5]

RUN_DIR is 06-run-device.py's output: scene-<ID>.png (the compositor's framebuffer, 320 x 320, captured after the
scene had been on screen for --scene-seconds) and run.json (the scene order). Under each capture: the scene ID and,
from the scene's CGAL record in uart.log, the passes it reached and its seconds per pass."""
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def main():
    a = sys.argv[1:]
    cols, scale = 6, 0.5
    if "--cols" in a:
        i = a.index("--cols"); cols = int(a[i + 1]); del a[i:i + 2]
    if "--scale" in a:
        i = a.index("--scale"); scale = float(a[i + 1]); del a[i:i + 2]
    if len(a) != 2:
        sys.exit(__doc__)
    run, out = Path(a[0]), Path(a[1])
    order = json.loads((run / "run.json").read_text())["scenes"]
    recs = {}
    for raw in (run / "uart.log").read_bytes().decode(errors="replace").splitlines():
        m = re.search(r'CGAL (\{"ev":"scene".*\})\s*$', raw)
        if m:
            try:
                r = json.loads(m[1])
            except json.JSONDecodeError:
                continue
            if r.get("reason") in ("chosen", "next", "time", "target") and r.get("passes", 0) >= 1:
                if r["reason"] == "chosen" or r["id"] not in recs:   # the scene phase's record
                    recs[r["id"]] = r
    side = int(320 * scale)
    label = 16
    rows = (len(order) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * side, rows * (side + label)), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)
    for k, sid in enumerate(order):
        f = run / f"scene-{sid}.png"
        if not f.exists():
            continue
        x, y = (k % cols) * side, (k // cols) * (side + label)
        sheet.paste(Image.open(f).convert("RGB").resize((side, side), Image.LANCZOS), (x, y))
        r = recs.get(sid, {})
        text = sid + (f"  {r['passes']} spp, {r['secPerPass']:.2f} s/pass" if r else "")
        draw.text((x + 4, y + side + 2), text, fill=(230, 230, 230))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
