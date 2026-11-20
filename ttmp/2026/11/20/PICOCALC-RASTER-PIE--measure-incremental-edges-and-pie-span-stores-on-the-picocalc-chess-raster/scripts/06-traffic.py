"""Count scalar pixels and aligned vector groups from the independent edge oracle."""
from collections import Counter
import json
from pathlib import Path
import struct
import sys

here = Path(__file__).resolve().parent
scene = next(here.parents[1].glob("PICOCALC-CHESS-3D--*")) / "scripts/scene"
sys.path.insert(0, str(scene))
from oracle import covered

poses = Path(sys.argv[1])
frames = {}
scene_rows = json.loads((poses / "receipt.json").read_text())["cases"]
for row in scene_rows:
    name = row["name"]
    words = tuple(v for v, in struct.iter_unpack("<H", (poses / (name + ".words")).read_bytes()))
    assert words[:5] == (1, 0, 0, 320, 280)
    stats = Counter(mattePixels=320*280, matteGroups=320*280//8)
    offset = 6
    while offset < len(words):
        op = words[offset]
        if op == 4:
            break
        if op == 3:
            offset += 7 + words[offset+6]
            continue
        assert op == 5
        p = words[offset+1:offset+7]
        rows = {}
        for x, y in covered(tuple(zip(p[::2], p[1::2]))):
            if y not in rows:
                rows[y] = [x, 0]
            rows[y][1] += 1
        for left, length in rows.values():
            aligned_groups = max(0, (length - (-left % 8)) // 8)
            groups = aligned_groups if length >= 16 else 0
            stats["maxTriangleSpan"] = max(stats["maxTriangleSpan"], length)
            stats["spansWithAlignedGroup"] += aligned_groups > 0
            stats["triangleSpans"] += 1
            stats["trianglePixels"] += length
            stats["vectorableSpans"] += groups > 0
            stats["triangleGroups"] += groups
        offset += 8
    frames[name] = dict(stats)
print(json.dumps(frames, indent=2))
