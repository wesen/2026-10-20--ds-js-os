#!/usr/bin/env python3
"""01-vendor-candela-generator-inputs.py: copy the upstream Candela files that tools/gen/candela reads but that
picocalc-os/third_party/candela did not hold, from the pinned archive, and pin them in PIN.json (Phase B2).

usage: python3 -I 01-vendor-candela-generator-inputs.py ARCHIVE.zip [--check]

ARCHIVE.zip is candela-workspace(1).zip (SHA-256 873b2dd4...df5d, the archive PIN.json names). Its members are read
with zipfile after the archive's digest is checked; nothing is extracted and nothing from it is run. Copies, byte for
byte, into picocalc-os/third_party/candela:

  src/render.js, src/wgsl2glsl.js   the kernel generator's post pass (render.js displaySource) and its import
  content/presets/<base>.md, .js    every preset tools/gen/candela/gallery.json lists, in upstream's layout (the
                                    .md frontmatter gives the id and the title the scene table shows)

and adds PIN.json "generator": {"note", "files": {path: sha256}}. The rest of PIN.json is left byte for byte as it
was. It also checks that the archive's copies of the 15 vendored src/ modules and the T0 presets equal the vendored
ones. With --check it writes nothing and fails if any vendored file or the PIN.json section differs."""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

ARCHIVE_SHA = "873b2dd4bb9c32cac08751baf9fa6960ee4377306a04b2e118a8969dd940df5d"
HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / ".git").exists())
DEST = REPO / "picocalc-os/third_party/candela"
GALLERY = REPO / "tools/gen/candela/gallery.json"
SRC = ["render.js", "wgsl2glsl.js"]
NOTE = ("Upstream files that only tools/gen/candela reads (the kernel's post pass and the gallery's scenes), copied byte "
        "for byte from the same archive; not bundled into the Candela world, whose files are modules and presets above")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    args = sys.argv[1:]
    check = "--check" in args
    args = [a for a in args if a != "--check"]
    if len(args) != 1:
        sys.exit(__doc__)
    archive = Path(args[0])
    raw = archive.read_bytes()
    if sha(raw) != ARCHIVE_SHA:
        sys.exit(f"{archive}: SHA-256 {sha(raw)}, expected {ARCHIVE_SHA}")
    z = zipfile.ZipFile(archive)
    names = set(z.namelist())

    def member(rel):
        name = "candela/" + rel
        if name not in names:
            sys.exit(f"{name} is not in the archive")
        return z.read(name)

    pin_text = (DEST / "PIN.json").read_text()
    pin = json.loads(pin_text)
    if json.dumps(pin, indent=1) + "\n" != pin_text:
        sys.exit("PIN.json is not in json.dumps(indent=1) form; refusing to rewrite it")
    if pin["archiveSha256"] != ARCHIVE_SHA:
        sys.exit(f"PIN.json names archive {pin['archiveSha256']}")
    # the files already vendored must be the archive's
    for mod, h in pin["modules"].items():
        if sha(member("src/" + mod)) != h or sha((DEST / "src" / mod).read_bytes()) != h:
            sys.exit(f"src/{mod} differs from the archive or from PIN.json")
    for pid, p in pin["presets"].items():
        if sha(member("content/presets/" + p["file"])) != p["sha256"]:
            sys.exit(f"preset {pid} differs from the archive")

    # preset id -> base name, from the frontmatter of every preset in the archive
    base = {}
    for name in sorted(names):
        m = re.fullmatch(r"candela/content/presets/([^/]+)\.md", name)
        if m:
            fm = re.search(r"^id:\s*(\S+)\s*$", z.read(name).decode("utf-8"), re.M)
            if fm:
                base[fm.group(1)] = m.group(1)
    want = {}
    for mod in SRC:
        want["src/" + mod] = member("src/" + mod)
    for pid, _size in json.loads(GALLERY.read_text())["scenes"]:
        if pid not in base:
            sys.exit(f"gallery preset {pid} is not in the archive")
        b = base[pid]
        if any(n.startswith(f"candela/content/presets/{b}/") for n in names):
            sys.exit(f"{b} has a lib/ folder; extend this script")
        for ext in (".md", ".js"):
            want[f"content/presets/{b}{ext}"] = member(f"content/presets/{b}{ext}")

    section = {"note": NOTE, "files": {rel: sha(data) for rel, data in want.items()}}
    bad = []
    for rel, data in want.items():
        dst = DEST / rel
        if check:
            if not dst.is_file() or dst.read_bytes() != data:
                bad.append(rel)
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(data)
    if check:
        if pin.get("generator") != section:
            bad.append("PIN.json generator")
        print("vendored generator inputs equal the archive" if not bad else "DIFFERENT: " + ", ".join(bad))
        sys.exit(1 if bad else 0)
    pin["generator"] = section
    (DEST / "PIN.json").write_text(json.dumps(pin, indent=1) + "\n")
    print(f"{len(want)} files under {DEST.relative_to(REPO)}; PIN.json generator section written")


if __name__ == "__main__":
    main()
