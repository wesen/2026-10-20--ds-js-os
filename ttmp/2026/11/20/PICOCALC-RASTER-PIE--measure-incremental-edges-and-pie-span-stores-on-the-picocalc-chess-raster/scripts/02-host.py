"""Compare the four RGB565 renderers, metadata and independent edge-function oracle."""
from hashlib import sha256
import json
from pathlib import Path
import random
import struct
import subprocess
import sys
import zlib

here = Path(__file__).resolve().parent
root = next(p for p in here.parents if (p / ".git").exists())
scene = next(here.parents[1].glob("PICOCALC-CHESS-3D--*")) / "scripts/scene"
sys.path.insert(0, str(scene))
from oracle import raster, small_font, hint_strip

poses, work, receipt = map(Path, sys.argv[1:])
work.mkdir(parents=True, exist_ok=True)
subprocess.run(["python3", "-B", here / "01-stage.py", work], check=True)
staged = work / "picocalc-os/nucleus"
nucleus = root / "picocalc-os/nucleus"
runner = work / "raster"
subprocess.run(["cc", "-std=gnu11", "-Os", "-g", "-ffunction-sections", "-fdata-sections",
                "-DRASTER_PIE_MODEL", "-I", staged, "-I", nucleus, here / "host.c",
                staged / "painter_commands.c", staged / "raster_edges.c", staged / "raster_scalar.c",
                staged / "raster_pie.c", nucleus / "gfx.c", nucleus / "util.c",
                "-Wl,--gc-sections", "-o", runner], check=True)

font = small_font(nucleus / "font_data.h")
before, after = b"\xa5" * (22 * 640), b"\xa5" * (18 * 640)


def check(words, rate="2.5"):
    result = subprocess.run([runner, rate], input=words, capture_output=True, check=True)
    pixels, hints = raster(words, font)
    assert result.stdout == before + pixels + after + hints.encode("ascii")
    return {
        "commandSHA256": sha256(words).hexdigest(),
        "frameSHA256": sha256(result.stdout[:204800]).hexdigest(),
        "frameCRC32": f"{zlib.crc32(result.stdout[:204800]):08x}",
        "appSHA256": sha256(pixels + hint_strip(hints, font)).hexdigest(),
        "metadata": result.stderr.decode().strip(),
    }


fixture = json.loads((poses / "receipt.json").read_text())
cases = [{**check((poses / (row["name"] + ".words")).read_bytes()), "scene": row["name"]}
         for row in fixture["cases"]]
assert len(cases) == 51

# Also compare the rounding, sparse dirty bits, clipped horizontal ownership,
# arbitrary slopes, tiny spans, and untouched chrome across independent tests.
rng = random.Random(64)
triangles = [
    (0, 0, 319, 0, 0, 279),
    (319, 279, 0, 279, 319, 0),
    (0, 0, 0, 139, 0, 279),
    (20, 20, 22, 22, 24, 24),
    (1, 10, 2, 10, 4, 50),
    (319, 17, 0, 18, 1, 19),
]
triangles += [tuple(v for _ in range(3) for v in (rng.randrange(320), rng.randrange(280)))
              for _ in range(80)]
for tri in triangles:
    # The oracle expects a clear. This second invocation removes it so dirty
    # masks must match individual nonempty spans rather than the matte's bands.
    for vertices in (tri, tri[4:] + tri[2:4] + tri[:2]):
        words = struct.pack("<16H", 1, 0, 0, 320, 280, 0x7bef, 5, *vertices, 0x1234, 4, 0)
        check(words, "199.75")
        sparse = subprocess.run([runner, "199.75"], input=words[12:], capture_output=True, check=True)
        assert sparse.stdout[:22*640] == before and sparse.stdout[302*640:204800] == after

for side in range(8):
    for length in range(1, 33):
        words = struct.pack("<8H", 1, side, 133, length, 1, 0xf7d3, 4, 0)
        subprocess.run([runner, "199.75"], input=words, capture_output=True, check=True)

invalid = [[5, 0, 0, 320, 1, 0, 1, 0, 4, 0], [5, 0, 280, 1, 1, 0, 1, 0, 4, 0], [5, 0, 0], [4, 2, 0]]
for words in invalid:
    result = subprocess.run([runner], input=struct.pack("<" + "H"*len(words), *words), capture_output=True)
    assert result.returncode == 2
receipt.write_text(json.dumps({"cases": cases, "trianglesPerPass": len(triangles)*2,
                               "extraSpanAlignmentCases": 256, "malformedLists": len(invalid)}, indent=2) + "\n")
print(f"{len(cases)} full scenes, {len(triangles)*2} triangles with and without matte, 256 alignment/tail cases")
