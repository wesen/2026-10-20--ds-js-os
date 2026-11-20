"""Materialize stock and experimental renderer arms from the same 3D command parser."""
from pathlib import Path
import subprocess
import sys

here = Path(__file__).resolve().parent
scene = next(here.parents[1].glob("PICOCALC-CHESS-3D--*")) / "scripts/scene"
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
subprocess.run(["python3", "-B", scene / "stage.py", out], check=True)
nucleus = out / "picocalc-os/nucleus"
stock = (nucleus / "painter_commands.c").read_text()
baseline = (scene / "triangle.inc").read_text()
assert stock.count(baseline) == 1
helper = (here / "edges.inc").read_text()
for number, name in enumerate(("edges", "scalar", "pie"), 1):
    source = stock.replace(baseline, f"#define RASTER_ARM {number}\n" + helper)
    first = source.index("bool painter_commands_valid(")
    last = source.index("void painter_commands_draw(")
    source = source[:first] + source[last:]
    source = source.replace("void painter_commands_draw(", f"void raster_draw_{name}(")
    if number > 1:
        original = "else gfx_fill(buffer, x, y, p[2], p[3], p[4]);"
        assert source.count(original) == 1
        source = source.replace(original, "else painter_fill(buffer, x, y, p[2], p[3], p[4]);")
    (nucleus / f"raster_{name}.c").write_text(source)
