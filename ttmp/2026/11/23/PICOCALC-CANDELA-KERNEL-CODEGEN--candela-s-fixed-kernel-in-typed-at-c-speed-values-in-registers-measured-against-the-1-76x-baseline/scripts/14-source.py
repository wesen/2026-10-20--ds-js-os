#!/usr/bin/env python3
"""14-source.py: a tree's candela-gallery compile unit, assembled as firmware/port/esp32p4/typed_apps.py does
(each source of app.json in order, followed by a newline) (PICOCALC-CANDELA-KERNEL-CODEGEN).

usage: python3 -I 14-source.py TREE OUT.typed"""
import json
import sys
from pathlib import Path

tree, out = Path(sys.argv[1]), Path(sys.argv[2])
app = tree / "apps/typed/candela-gallery"
names = json.loads((app / "app.json").read_text())["sources"]
out.write_text("".join((app / n).read_text() + "\n" for n in names))
print(out, out.stat().st_size)
