#!/usr/bin/env python3
"""Make nucleus/font_data.h: crisp bitmap fonts for the nucleus.

The glyphs come from Terminus Font by Dimitar Toshkov Zhekov (SIL Open Font License 1.1), whose bitmap
sizes match the cells used here exactly. A few symbols Terminus lacks (small triangles, a cross, the
return and backspace keys) are drawn on the pixel grid below. Because the result is a modified subset,
it is not called "Terminus Font" (a Reserved Font Name); it is "pc-term", and it stays under the OFL
(third_party/fonts/OFL.txt).

Needs the PCF files from Debian/Ubuntu's xfonts-terminus and the pcf2bdf tool:
    apt-get install xfonts-terminus pcf2bdf
    python3 tools/gen_font.py [out.h]

Each glyph is stored as one 4-bit alpha value per pixel (two per byte), the format the nucleus blends;
these fonts only use 0 and 15, so text is drawn with hard edges.
"""
import gzip
import os
import subprocess
import sys
import tempfile
from PIL import Image, ImageDraw

PCF_DIR = "/usr/share/fonts/X11/misc"
EXTRA = "▸▾◂•…←→↑↓▲▼✓✕°·█▒░─│┌┐└┘├┤┬┴┼⏎⌫"
CHARS = [chr(c) for c in range(32, 127)] + list(EXTRA)

# name, Terminus file, cell width, cell height
FONTS = [("s", "ter-u12n", 6, 12), ("m", "ter-u16n", 8, 16), ("mb", "ter-u16b", 8, 16),
         ("l", "ter-u20b", 10, 20), ("xl", "ter-u32b", 16, 32)]


def load_bdf(name):
    """Glyphs of a Terminus size as {codepoint: (bbx, rows)}, plus the font's ascent."""
    pcf = os.path.join(PCF_DIR, name + "_unicode.pcf.gz")
    with tempfile.TemporaryDirectory() as tmp:
        raw = os.path.join(tmp, name + ".pcf")
        with gzip.open(pcf) as src, open(raw, "wb") as dst:
            dst.write(src.read())
        bdf = os.path.join(tmp, name + ".bdf")
        subprocess.run(["pcf2bdf", "-o", bdf, raw], check=True)
        lines = open(bdf, encoding="latin-1").read().splitlines()
    ascent = next(int(l.split()[1]) for l in lines if l.startswith("FONT_ASCENT"))
    glyphs, i = {}, 0
    while i < len(lines):
        if lines[i].startswith("STARTCHAR"):
            enc, bbx, rows = None, None, []
            while not lines[i].startswith("ENDCHAR"):
                l = lines[i]
                if l.startswith("ENCODING"):
                    enc = int(l.split()[1])
                elif l.startswith("BBX"):
                    bbx = tuple(int(v) for v in l.split()[1:5])
                elif l == "BITMAP":
                    i += 1
                    while not lines[i].startswith("ENDCHAR"):
                        rows.append(int(lines[i], 16))
                        i += 1
                    break
                i += 1
            if enc is not None:
                glyphs[enc] = (bbx, rows)
        i += 1
    return glyphs, ascent


def from_bdf(glyph, ascent, cw, ch):
    (w, h, xo, yo), rows = glyph
    px = [[0] * cw for _ in range(ch)]
    nbytes = (w + 7) // 8
    top = ascent - (yo + h)
    for j, row in enumerate(rows):
        for i in range(w):
            if row >> (nbytes * 8 - 1 - i) & 1:
                x, y = xo + i, top + j
                if 0 <= x < cw and 0 <= y < ch:
                    px[y][x] = 1
    return px


def drawn(c, cw, ch, ascent):
    """The symbols Terminus does not have, drawn without anti-aliasing."""
    im = Image.new("1", (cw, ch), 0)
    d = ImageDraw.Draw(im)
    mid = ascent - ch // 4 - 1          # the middle of a lower-case letter
    s = max(2, cw // 2)                 # half the size of a small triangle
    cx = cw // 2
    if c == "▸":
        d.polygon([(cx - s // 2, mid - s), (cx - s // 2, mid + s), (cx - s // 2 + s, mid)], fill=1)
    elif c == "◂":
        d.polygon([(cx + s // 2, mid - s), (cx + s // 2, mid + s), (cx + s // 2 - s, mid)], fill=1)
    elif c == "▾":
        d.polygon([(cx - s, mid - s // 2), (cx + s, mid - s // 2), (cx, mid + s // 2)], fill=1)
    elif c == "✕":
        r = max(2, cw // 2 - 1)
        for t in range(max(1, cw // 8)):
            d.line([(cx - r + t, mid - r), (cx + r + t, mid + r)], fill=1)
            d.line([(cx + r + t, mid - r), (cx - r + t, mid + r)], fill=1)
    elif c == "⏎":
        right, y = cw - 2, mid + 1
        d.line([(right, mid - ch // 4), (right, y)], fill=1)
        d.line([(1, y), (right, y)], fill=1)
        a = max(2, cw // 4)
        d.line([(1, y), (1 + a, y - a)], fill=1)
        d.line([(1, y), (1 + a, y + a)], fill=1)
    elif c == "⌫":
        top, bot, a = mid - cw // 3 - 1, mid + cw // 3 + 1, max(2, cw // 4)
        d.polygon([(0, mid), (a, top), (cw - 1, top), (cw - 1, bot), (a, bot)], outline=1)
        r = max(1, (bot - top) // 4)
        x0 = a + (cw - 1 - a) // 2
        d.line([(x0 - r, mid - r), (x0 + r, mid + r)], fill=1)
        d.line([(x0 + r, mid - r), (x0 - r, mid + r)], fill=1)
    return [[1 if im.getpixel((x, y)) else 0 for x in range(cw)] for y in range(ch)]


def pack(px):
    q = [15 if v else 0 for row in px for v in row]
    if len(q) % 2:
        q.append(0)
    return bytes((q[i] << 4) | q[i + 1] for i in range(0, len(q), 2))


def main(out):
    lines = ["// Generated by tools/gen_font.py. Do not edit.",
             "// pc-term: a subset of Terminus Font (c) 2010-2014 Dimitar Toshkov Zhekov, with a few added",
             "// symbols. Licensed under the SIL Open Font License 1.1: see third_party/fonts/OFL.txt.",
             "#pragma once", "#include <stdint.h>", ""]
    cps = [ord(c) for c in CHARS]
    lines.append(f"#define FONT_GLYPHS {len(cps)}")
    lines.append("static const uint32_t font_codepoints[FONT_GLYPHS] = {" + ",".join(str(c) for c in cps) + "};")
    sheet = []
    for name, src, cw, ch in FONTS:
        glyphs, ascent = load_bdf(src)
        rendered = []
        for c in CHARS:
            g = glyphs.get(ord(c))
            rendered.append(from_bdf(g, ascent, cw, ch) if g else drawn(c, cw, ch, ascent))
        sheet.append((name, cw, ch, rendered))
        blob = b"".join(pack(px) for px in rendered)
        lines.append(f"// {name}: {cw}x{ch} cell, from {src}")
        lines.append(f"static const uint8_t font_{name}_data[{len(blob)}] = {{")
        for i in range(0, len(blob), 32):
            lines.append("  " + ",".join(str(b) for b in blob[i:i + 32]) + ",")
        lines.append("};")
    lines.append("typedef struct { const char *name; int w, h; const uint8_t *data; } font_def_t;")
    lines.append("static const font_def_t font_table[] = {")
    for name, src, cw, ch in FONTS:
        lines.append(f'  {{ "{name}", {cw}, {ch}, font_{name}_data }},')
    lines.append("};")
    lines.append(f"#define FONT_COUNT {len(FONTS)}")
    open(out, "w").write("\n".join(lines) + "\n")
    print("wrote", out, len(CHARS), "glyphs x", len(FONTS), "fonts")
    if len(sys.argv) > 2:   # a preview sheet
        W = 16 * 2 + max(cw * 32 for _, cw, _, _ in sheet)
        H = sum((ch + 4) * 4 for _, _, ch, _ in sheet) + 8
        im = Image.new("RGB", (W, H), (246, 244, 239))
        y = 4
        for name, cw, ch, rendered in sheet:
            for k, px in enumerate(rendered):
                ox, oy = 8 + (k % 32) * cw, y + (k // 32) * (ch + 4)
                for j, row in enumerate(px):
                    for i, v in enumerate(row):
                        if v:
                            im.putpixel((ox + i, oy + j), (29, 28, 26))
            y += (ch + 4) * 4
        im = im.resize((W * 3, H * 3), Image.NEAREST)
        im.save(sys.argv[2])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "nucleus/font_data.h")
