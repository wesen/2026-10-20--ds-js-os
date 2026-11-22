#!/usr/bin/env python3
"""Phase E follow-up: three replays build JS-root paths as join(os, 'js/...') or join(os, 'js', file), with
os = resolve('picocalc-os'); 07 knew only join(os, 'worlds/...'). Run once after 07.
"""
import subprocess
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
for name, a, b in [("agenda-wasm-world.mjs", 4, 1), ("editor-world.mjs", 3, 1), ("files-wasm.mjs", 3, 1)]:
    p = REPO / "bench/host/replays" / name
    s = p.read_text()
    assert s.count("join(os, 'js/") == a and s.count("join(os, 'js', ") == b, (name, s.count("join(os, 'js/"), s.count("join(os, 'js', "))
    p.write_text(s.replace("join(os, 'js/", "join(os, '../apps/js/picocalc/").replace("join(os, 'js', ", "join(os, '../apps/js/picocalc', "))
    print("fixed", name)
