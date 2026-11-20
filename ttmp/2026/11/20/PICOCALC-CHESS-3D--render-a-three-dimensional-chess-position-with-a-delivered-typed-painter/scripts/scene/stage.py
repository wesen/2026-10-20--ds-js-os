"""Install the experiment in an isolated product source tree or host raster directory."""
import argparse
from pathlib import Path
import shutil

here = Path(__file__).resolve().parent
root = here.parents[6]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("tree", type=Path)
args = parser.parse_args()
dst = args.tree.resolve()
if dst == root or root.is_relative_to(dst):
    raise SystemExit("choose an isolated staging tree")
os_src = root / "picocalc-os"
os_dst = dst / "picocalc-os"
nucleus = os_dst / "nucleus"
nucleus.mkdir(parents=True, exist_ok=True)
world = os_dst / "worlds/chess"
world.mkdir(parents=True, exist_ok=True)
shutil.copyfile(here / "isometric.typed", world / "painter.typed")
code = (os_src / "nucleus/painter_commands.c").read_text()
def insert(old, new):
    global code
    assert code.count(old) == 1, old
    code = code.replace(old, new, 1)
insert('#include "painter_commands.h"', '#include "painter_commands.h"\n' + (here / "triangle.inc").read_text())
insert('if (op == MOBILE_PAINTER_RECT || op == MOBILE_PAINTER_FILL) {', '''if (op == 5) {
      if (left < 7) return false;
      for (int i = 0; i < 3; i++)
        if (p[2*i] >= PAINTER_WIDTH || p[2*i+1] >= PAINTER_HEIGHT) return false;
      at += 7;
    } else if (op == MOBILE_PAINTER_RECT || op == MOBILE_PAINTER_FILL) {''')
insert('    int x = p[0], y = PAINTER_TOP + p[1];', '''    if (op == 5) {
      painter_triangle(buffer, p);
      at += 7;
      continue;
    }
    int x = p[0], y = PAINTER_TOP + p[1];''')
(nucleus / "painter_commands.c").write_text(code)
shutil.copyfile(os_src / "nucleus/painter_commands.h", nucleus / "painter_commands.h")
header = (os_src / "nucleus/mobile_painter.h").read_text()
assert header.count("MOBILE_PAINTER_MAX_COMMANDS = 274") == 1
# Fill + four side-wall triangles + 128 tile faces + at most ten
# commands per piece + hints. 32 * 10 is also safe under promotion.
(nucleus / "mobile_painter.h").write_text(
    header.replace("MOBILE_PAINTER_MAX_COMMANDS = 274", "MOBILE_PAINTER_MAX_COMMANDS = 454")
)

