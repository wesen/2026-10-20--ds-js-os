"""Independent pixel-center and small-font reference for the 3D trial."""
from array import array
from functools import cache
import re
import struct
import sys

WIDTH = 320
BODY_HEIGHT = 280


@cache
def covered(vertices):
    def area(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    winding = area(*vertices)
    if winding == 0:
        return ()
    if winding < 0:
        vertices = vertices[::-1]
    edges = []
    for (x, y), (xx, yy) in zip(vertices, vertices[1:] + vertices[:1]):
        dx, dy = xx - x, yy - y
        edges.append((x, y, dx, dy, dy < 0 or (dy == 0 and dx > 0)))
    return tuple((x, y)
                 for y in range(min(v[1] for v in vertices), max(v[1] for v in vertices))
                 for x in range(min(v[0] for v in vertices), max(v[0] for v in vertices))
                 if all((edge := dx * (2 * y + 1 - 2 * ay) - dy * (2 * x + 1 - 2 * ax)) > 0
                        or (edge == 0 and shared) for ax, ay, dx, dy, shared in edges))


def small_font(header):
    code = header.read_text()
    data = re.search(r"font_s_data\[\d+\] = \{([^}]+)\}", code)[1]
    return bytes(int(value) for value in re.findall(r"\d+", data))


def rgb565(hex_color):
    return ((hex_color >> 19) << 11) | (((hex_color >> 10) & 63) << 5) | ((hex_color >> 3) & 31)


def little_endian(pixels):
    if sys.byteorder != "little":
        pixels.byteswap()
    return pixels.tobytes()


def draw_small(pixels, font, start_x, y, text, color, max_width):
    glyphs = [ord(char) - 32 for char in text]
    if len(glyphs) * 6 > max_width:
        glyphs = glyphs[: (max_width - 6) // 6] + [99]  # U+2026 in the font table.
    red, green, blue = color >> 11, (color >> 5) & 63, color & 31
    for column, glyph in enumerate(glyphs):
        for sample in range(72):
            row, offset = divmod(sample, 6)
            packed = font[glyph * 36 + sample // 2]
            alpha = packed & 15 if sample % 2 else packed >> 4
            if alpha:
                at = (y + row) * WIDTH + start_x + column * 6 + offset
                bg = pixels[at]
                inv = 15 - alpha
                r = ((bg >> 11) * inv + red * alpha) // 15
                g = (((bg >> 5) & 63) * inv + green * alpha) // 15
                b = ((bg & 31) * inv + blue * alpha) // 15
                pixels[at] = (r << 11) | (g << 5) | b


def raster(payload, font):
    pixels = array("H", [0]) * (WIDTH * BODY_HEIGHT)
    words = [word for word, in struct.iter_unpack("<H", payload)]
    at = 0
    while at < len(words):
        op = words[at]
        if op == 1:
            assert at == 0 and words[1:5] == [0, 0, WIDTH, BODY_HEIGHT]
            pixels = array("H", [words[5]]) * (WIDTH * BODY_HEIGHT)
            at += 6
        elif op == 5:
            ax, ay, bx, by, cx, cy, color = words[at + 1:at + 8]
            for x, y in covered(((ax, ay), (bx, by), (cx, cy))):
                pixels[y * WIDTH + x] = color
            at += 8
        elif op == 3:
            x, y, size, color, width, count = words[at + 1:at + 7]
            assert size == 0 and count == 1
            draw_small(pixels, font, x, y, chr(words[at + 7]), color, width)
            at += 8
        elif op == 4:
            assert words[at + 1] == len(words) - at - 2
            hints = "".join(chr(c) for c in words[at + 2:])
            return little_endian(pixels), hints
        else:
            raise ValueError(f"unexpected command {op}")
    raise ValueError("absent terminal hint")


def hint_strip(hints, font):
    pixels = array("H", [rgb565(0xEBE7DE)]) * (WIDTH * 18)
    pixels[:WIDTH] = array("H", [rgb565(0xDCD7CC)]) * WIDTH
    draw_small(pixels, font, 8, 4, "F1 home  " + hints, rgb565(0x787369), WIDTH - 16)
    return little_endian(pixels)
