#!/usr/bin/env python3
"""Compare two firmware builds' bundles (esp-idf/main/js_bundle.c) by content: which published files are byte-identical
under the same or a new name, which are new, which are gone, and which changed.

usage: python3 03-compare-bundles.py OLD_BUILD NEW_BUILD [--json OUT]
"""
import hashlib
import json
import re
import sys
from pathlib import Path


def bundle(build):
    text = (Path(build) / "esp-idf/main/js_bundle.c").read_text()
    data = {m[1]: bytes(int(x, 16) for x in m[2].split(",") if x)
            for m in re.finditer(r"static const unsigned char (f\d+)\[\] = \{([^}]*)\};", text)}
    files = {}
    for m in re.finditer(r'\{ "([^"]+)", (f\d+), (\d+) \}', text):
        files[m[1]] = data[m[2]][:int(m[3])]
    return files


def main():
    old, new = bundle(sys.argv[1]), bundle(sys.argv[2])
    digest = lambda b: hashlib.sha256(b).hexdigest()[:16]
    by_old = {}
    for p, b in old.items():
        by_old.setdefault(digest(b), []).append(p)
    rows = []
    matched_old = set()
    for p, b in sorted(new.items()):
        d = digest(b)
        if p in old and digest(old[p]) == d:
            rows.append(("same", p, p, len(b)))
            matched_old.add(p)
        elif d in by_old:
            rows.append(("renamed", by_old[d][0], p, len(b)))
            matched_old.update(by_old[d])
        elif p in old:
            rows.append(("changed", p, p, len(b)))
            matched_old.add(p)
        else:
            rows.append(("new", "", p, len(b)))
    for p in sorted(set(old) - matched_old):
        rows.append(("gone", p, "", len(old[p])))
    for r in rows:
        print(f"{r[0]:8} {r[1]:32} {r[2]:32} {r[3]}")
    counts = {k: sum(r[0] == k for r in rows) for k in ("same", "renamed", "changed", "new", "gone")}
    print(counts)
    if "--json" in sys.argv:
        Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps({"rows": rows, "counts": counts}, indent=1))


if __name__ == "__main__":
    main()
