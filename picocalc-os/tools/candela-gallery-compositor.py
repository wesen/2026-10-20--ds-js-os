#!/usr/bin/env python3
"""candela-gallery-compositor.py IN OUT: the compositor with the Candela gallery (PICOCALC-CANDELA-GALLERY).

Run by port/esp32p4/main/CMakeLists.txt only with PICOCALC_CANDELA_GALLERY, on js/system/compositor.js; the build
compiles OUT (with CJI) instead of IN. Without the option the compositor is not touched, so the playable firmware's
compositor stays byte for byte what it was. Each edit is anchored on text that must occur exactly once; if the
compositor changes so that an anchor is missing or repeated, the build stops here instead of producing a compositor
that draws the gallery wrongly.

The edits: a gallery frame ({t: "gallery", seq, skip}) is validated like the Ray Tracer's; while the gallery is in
front and no banner is up, the firmware's gallery renderer draws the whole screen (fb.raytrace(skip, 0, 0, 0, 1000),
nucleus/gfx.c gfx_gallery); with a banner, the normal chrome is drawn around the same call."""
import sys

EDITS = [
    ("function paint(s) {\n",
     "// The Candela gallery (PICOCALC-CANDELA-GALLERY; added by tools/candela-gallery-compositor.py): the firmware's\n"
     "// gallery renderer draws the screen. skip is the gallery world's scene counter; seq makes each frame new.\n"
     "function validGallery(n) { return n && n.t === \"gallery\" && rayCoord(n.seq, 0, 999999999) && rayCoord(n.skip, -1000000, 1000000); }\n"
     "function drawGallery(fb, n) { fb.raytrace(n.skip, 0, 0, 0, 1000); }\n\n"
     "function paint(s) {\n"),
    ("  s.paintedSnake = null;\n  fb.fill(0, 0, W, H, C.paper);\n",
     "  s.paintedSnake = null;\n"
     "  if (s.focus === \"gallery\" && app && app.tree && !s.banner) { drawGallery(fb, app.tree); return; }\n"
     "  fb.fill(0, 0, W, H, C.paper);\n"),
    ("      else if (s.focus === \"raytrace\") drawRayScene(fb, app.tree);\n",
     "      else if (s.focus === \"raytrace\") drawRayScene(fb, app.tree);\n"
     "      else if (s.focus === \"gallery\") drawGallery(fb, app.tree);\n"),
    ("    if (f.app === \"raytrace\" && !validRayScene(tree)) return;\n",
     "    if (f.app === \"raytrace\" && !validRayScene(tree)) return;\n"
     "    if (f.app === \"gallery\" && !validGallery(tree)) return;\n"),
]


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src = open(sys.argv[1], encoding="utf-8").read()
    for old, new in EDITS:
        n = src.count(old)
        if n != 1:
            sys.exit(f"candela-gallery-compositor: anchor found {n} times, expected once: {old!r}")
        src = src.replace(old, new)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(src)


if __name__ == "__main__":
    main()
