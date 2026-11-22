#!/usr/bin/env python3
"""Phase E: the applications and tours under apps/ (PICOCALC-REPO-LAYOUT design Section 4.1), before Phase D.

usage: python3 07-phase-e-move-apps.py [--dry-run]        (runs once, on a clean tree, with no build running)

Moves (git mv):
  picocalc-os/worlds/{agenda,candela,chess,editor,files,raytrace}  -> apps/typed/<world>      Typed worlds
  picocalc-os/worlds/{candela-world,candela-gallery}               -> apps/js/worlds/<world>  QuickJS worlds
  picocalc-os/js, js-papers3                                       -> apps/js/picocalc, apps/js/papers3
  picocalc-os/scripts, scripts-agent, scripts-papers3              -> apps/tours/{picocalc,agent,papers3}

Two departures from the design's table, both because a JS root is bundled whole: the P4 build bundles every file
under its JS root into the device filesystem (main/CMakeLists.txt, GLOB_RECURSE ${OS}/js/*), so the two QuickJS
Candela worlds cannot live inside apps/js/picocalc/ without entering every profile's bundle. They go to
apps/js/worlds/, and the firmware adds them by name as before. Phase E runs before Phase D so that the Typed worlds
move once (picocalc-os/worlds -> apps/typed) instead of twice (via firmware/worlds).

References are rewritten in two forms: repository-relative strings ("picocalc-os/worlds/files/...") everywhere outside
ttmp/, and paths relative to the firmware tree (${OS}/worlds/..., worlds/... in its Makefile, OS / "js" in its tests)
in the files that use that form. Device filesystem paths ("js/system.json" in the ports' C code) are not repository
paths and are not touched. Reads of old revisions keep their paths.
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
DRY = sys.argv[1:] == ["--dry-run"]
assert sys.argv[1:] in ([], ["--dry-run"])

TYPED = ("agenda", "candela", "chess", "editor", "files", "raytrace")
MOVES = [(f"picocalc-os/worlds/{w}", f"apps/typed/{w}") for w in TYPED] + [
    ("picocalc-os/worlds/candela-world", "apps/js/worlds/candela-world"),
    ("picocalc-os/worlds/candela-gallery", "apps/js/worlds/candela-gallery"),
    ("picocalc-os/js", "apps/js/picocalc"),
    ("picocalc-os/js-papers3", "apps/js/papers3"),
    ("picocalc-os/scripts", "apps/tours/picocalc"),
    ("picocalc-os/scripts-agent", "apps/tours/agent"),
    ("picocalc-os/scripts-papers3", "apps/tours/papers3"),
]

# Repository-relative prefixes, in order (the QuickJS worlds before the generic worlds/ rule).
PREFIXES = [
    ("picocalc-os/worlds/candela-world", "apps/js/worlds/candela-world"),
    ("picocalc-os/worlds/candela-gallery", "apps/js/worlds/candela-gallery"),
    ("picocalc-os/worlds/", "apps/typed/"),
    ("picocalc-os/js-papers3", "apps/js/papers3"),
    ("picocalc-os/js/", "apps/js/picocalc/"),
    ("picocalc-os/scripts-agent", "apps/tours/agent"),
    ("picocalc-os/scripts-papers3", "apps/tours/papers3"),
    ("picocalc-os/scripts/", "apps/tours/picocalc/"),
]
HISTORICAL = ['const path="picocalc-os/worlds/chess/"+file+".typed";']   # chess-holdout.mjs reads revision 57b2d9f
SKIP = {"pkg/tracecompiler/compiler.go"}                                 # WorldRoots names both layouts on purpose

EDITS = {}


def edit(path, old, new, count=1):
    EDITS.setdefault(path, []).append((old, new, count))


# --- firmware-tree-relative forms ----------------------------------------------------------------------------------
P4 = "picocalc-os/port/esp32p4/main/CMakeLists.txt"
edit(P4, "${OS}/worlds/candela-world", "${OS}/../apps/js/worlds/candela-world", None)
edit(P4, "${OS}/worlds/candela-gallery", "${OS}/../apps/js/worlds/candela-gallery", None)
edit(P4, "${OS}/worlds/", "${OS}/../apps/typed/", None)
edit(P4, "-DJS_ROOT=${OS}/js ", "-DJS_ROOT=${OS}/../apps/js/picocalc ")
edit(P4, "${OS}/js/", "${OS}/../apps/js/picocalc/", None)
S3 = "picocalc-os/port/esp32s3-papers3/main/CMakeLists.txt"
edit(S3, "${OS}/js-papers3", "${OS}/../apps/js/papers3", 3)
MK = "picocalc-os/Makefile"
edit(MK, "worlds/candela-world/", "../apps/js/worlds/candela-world/", 4)
edit(MK, "worlds/agenda/", "../apps/typed/agenda/", 2)
edit(MK, "worlds/files/", "../apps/typed/files/", 3)
edit(MK, "  SCRIPTS := scripts-papers3\n", "  SCRIPTS := ../apps/tours/papers3\n")
edit(MK, "  JSROOT  := js-papers3\n", "  JSROOT  := ../apps/js/papers3\n")
edit(MK, "  SCRIPTS := scripts\n", "  SCRIPTS := ../apps/tours/picocalc\n")
edit(MK, "  JSROOT  := js\n", "  JSROOT  := ../apps/js/picocalc\n")
edit(MK, "$(wildcard js/*.js js/*/*.js js/*.json)", "$(wildcard $(JSROOT)/*.js $(JSROOT)/*/*.js $(JSROOT)/*.json)")
BL = "apps/js/worlds/candela-world/bundle.list"
edit(BL, " worlds/candela-world/", " ../apps/js/worlds/candela-world/", 7)
CS = "tools/gen/candela/candela-stage.py"
edit(CS, 'root / "worlds/candela-world/', 'root / "../apps/js/worlds/candela-world/', 3)
edit(CS, '"--list", "worlds/candela-world/bundle.list"', '"--list", "../apps/js/worlds/candela-world/bundle.list"')
edit(CS, 'shutil.copytree(root / "js", stage)', 'shutil.copytree(root / "../apps/js/picocalc", stage)')
edit(CS, 'root / "js/system.json"', 'root / "../apps/js/picocalc/system.json"')
edit(CS, "Writes BUILD_DIR/candela-js: a copy of js/,", "Writes BUILD_DIR/candela-js: a copy of apps/js/picocalc/,")
edit(CS, "(BUNDLE_TOOL --list worlds/candela-world/bundle.list .)", "(BUNDLE_TOOL --list ../apps/js/worlds/candela-world/bundle.list .)")
edit(CS, "manifest entry (worlds/candela-world/manifest.json)", "manifest entry (apps/js/worlds/candela-world/manifest.json)")
edit("picocalc-os/host/main_host.c", 'const char *js = "js",', 'const char *js = "../apps/js/picocalc",')
edit("picocalc-os/tools/generate-chess-meshes.py", 'parents[1] / "worlds/chess/painter-3d.typed"', 'parents[2] / "apps/typed/chess/painter-3d.typed"')
edit("bench/board/stage.mjs", 'read(join(os,"worlds/raytrace/raytrace.typed"),"utf8")', 'read(join(root,"apps/typed/raytrace/raytrace.typed"),"utf8")')
for f, n in (("bench/host/replays/agenda-wasm-world.mjs", 1), ("bench/host/replays/editor-world.mjs", 1), ("bench/host/replays/files-wasm.mjs", 1)):
    edit(f, "join(os, 'worlds/", "join(os, '../apps/typed/", n)
edit("pkg/traceapi/compiler_test.go", "const dir = 'picocalc-os/worlds/';", "const dir = w.worlds + '/';")

# The firmware tree's own tests: relative to picocalc-os/tests (URLs) or to picocalc-os (OS, ROOT).
for t in ("agenda", "calc", "chat-ui", "compositor-auth", "editor", "sysapps", "agent"):
    p = f"picocalc-os/tests/{t}.test.mjs"
    edit(p, 'new URL("../js/', 'new URL("../../apps/js/picocalc/', None) if t != "agent" else None
edit("picocalc-os/tests/agent.test.mjs", "new URL('../js/", "new URL('../../apps/js/picocalc/")
for t in ("test_agent_native", "test_fs_native", "test_native_worlds"):
    edit(f"picocalc-os/tests/{t}.py", 'OS / "js/', 'OS / "../apps/js/picocalc/', None)
edit("picocalc-os/tests/test_native_worlds.py", 'shutil.copytree(OS / "js", root / "js")', 'shutil.copytree(OS / "../apps/js/picocalc", root / "js")')
edit("picocalc-os/tests/test_sys_native.py", 'shutil.copytree(OS / "js", root / "js")', 'shutil.copytree(OS / "../apps/js/picocalc", root / "js")')
edit("picocalc-os/tests/test_sys_native.py", '[str(BINARY), "-j", "js",', '[str(BINARY), "-j", str(OS / "../apps/js/picocalc"),')
edit("picocalc-os/tests/agent-integration.py", "ROOT / 'scripts-agent/tour.txt'", "ROOT / '../apps/tours/agent/tour.txt'", 2)


def apply_prefixes(path, text):
    if path in SKIP:
        return text
    held = {}
    for i, h in enumerate(HISTORICAL):
        if h in text:
            key = f"\0HELD{i}\0"
            text = text.replace(h, key)
            held[key] = h
    for old, new in PREFIXES:
        text = text.replace(old, new)
    for key, h in held.items():
        text = text.replace(key, h)
    return text


def main():
    dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=REPO, capture_output=True, text=True).stdout
    assert not dirty, "commit or stash first:\n" + dirty
    for src, dest in MOVES:
        assert (REPO / src).exists() and not (REPO / dest).exists(), (src, dest)
        if not DRY:
            (REPO / dest).parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "mv", src, dest], cwd=REPO, check=True)
    changed = []
    files = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True).stdout.split("\n")
    for path in files:
        if not path or path.startswith("ttmp/") or path.endswith((".png", ".bin", ".gz", ".elf", ".jpg", ".wasm", ".o", ".ttf")):
            continue
        p = REPO / path
        if DRY:
            for src, dest in MOVES:
                if path == src or path.startswith(src + "/"):
                    path = dest + path[len(src):]
                    break
        if not p.is_file():
            continue
        try:
            text = p.read_text()
        except UnicodeDecodeError:
            continue
        new = text
        for old, rep, count in EDITS.pop(path, []):
            found = new.count(old)
            assert (found >= 1 if count is None else found == count), (path, old, found)
            new = new.replace(old, rep)
        new = apply_prefixes(path, new)
        if new != text:
            changed.append(path)
            if not DRY:
                p.write_text(new)
    assert not EDITS, f"edits for files that do not exist: {list(EDITS)}"
    print(("would change" if DRY else "changed"), len(changed), "files:")
    for c in changed:
        print("  ", c)


if __name__ == "__main__":
    main()
