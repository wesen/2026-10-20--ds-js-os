#!/usr/bin/env python3
"""Pack planar piece profiles and their cap triangulations into Typed constants."""
import argparse
from pathlib import Path

PATH = Path(__file__).resolve().parents[2] / "apps/typed/chess/painter-3d.typed"
MARKER = "// Generated extrusion tables follow. Run tools/generate-chess-meshes.py.\n"

# Ordered outlines in the plane of the ears/muzzle, mitre or cross.
PROFILES = {
    2: [(4, 5), (4, 14), (2, 20), (2, 24), (0, 21), (-7, 18), (-6, 14), (-2, 16), (-1, 5)],
    3: [(-3, 13), (-4, 18), (-3, 22), (0, 27), (4, 21), (0, 20), (4, 18), (3, 13)],
    6: [(-1, 18), (1, 18), (1, 24), (5, 24), (5, 26), (1, 26),
        (1, 30), (-1, 30), (-1, 26), (-5, 26), (-5, 24), (-1, 24)],
}


def area(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def tessellate(outline):
    """Clip a convex ear at a time from a counterclockwise outline."""
    remaining = list(outline)
    while len(remaining) > 3:
        for i, b in enumerate(remaining):
            j = (i + 1) % len(remaining)
            a, c = remaining[i - 1], remaining[j]
            if area(a, b, c) <= 0:
                continue
            if any(area(a, b, p) >= 0 and area(b, c, p) >= 0 and area(c, a, p) >= 0
                   for p in remaining if p not in (a, b, c)):
                continue
            yield a, b, c
            remaining.pop(i)
            break
        else:
            raise ValueError(f"invalid mesh outline {outline}")
    yield tuple(remaining)



def counterclockwise(points):
    area2 = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))
    return points if area2 > 0 else list(reversed(points))


def grouped(numbers, slots, base):
    for start in range(0, len(numbers), slots):
        yield sum(value * base ** i for i, value in enumerate(numbers[start:start + slots]))


def lookup(name, tables):
    def cases(group, indent):
        return [f"{indent}if (slot === {i}) {{ return {value}; }}" for i, value in enumerate(group[:-1])] + [
            f"{indent}return {group[-1]};"]

    lines = [f"function {name}(kind: i32, slot: i32): i32 {{"]
    for kind, group in list(tables.items())[:-1]:
        lines.extend([f"    if (kind === {kind}) {{", *cases(group, "        "), "    }"])
    lines.extend(cases(list(tables.values())[-1], "    "))
    lines.extend(["}", ""])
    return "\n".join(lines)


def generated():
    outlines = {}
    caps = {}
    for kind, shape in PROFILES.items():
        points = counterclockwise(shape)
        assert len(points) <= 16
        assert all(-7 <= v <= 7 and 0 <= y < 32 for v, y in points)
        outlines[kind] = list(grouped([16 * y + v + 7 for v, y in points], 3, 512))
        triangles = [[points.index(p) for p in triangle] for triangle in tessellate(points)]
        caps[kind] = list(grouped([a + 16 * b + 256 * c for a, b, c in triangles], 2, 4096))
    return lookup("outlineTable", outlines) + "\n" + lookup("capTable", caps)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--check", action="store_true")
    a = p.parse_args()
    source = PATH.read_text()
    body = source.split(MARKER, 1)[0]
    result = body + MARKER + generated()
    if a.check:
        if source != result:
            raise SystemExit("generated Chess meshes are stale")
    else:
        PATH.write_text(result)


if __name__ == "__main__":
    main()
