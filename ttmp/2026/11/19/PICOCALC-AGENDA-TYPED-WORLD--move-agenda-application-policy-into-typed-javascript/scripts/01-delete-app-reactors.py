#!/usr/bin/env python3
"""Delete Agenda's and Files' app-specific reactors and link adapters, now that both apps are complete Typed worlds.

    python3 scripts/01-delete-app-reactors.py            # dry run: list what would go
    python3 scripts/01-delete-app-reactors.py --apply    # delete (git rm)

Run from anywhere inside the repository. Asserts that exactly these 10 tracked files exist and that no tracked file
outside ttmp/ still names them.
"""
import subprocess
import sys

FILES = [
    "apps/typed/agenda/wasm-world.c",
    "apps/typed/agenda/wasm-slot.c",
    "apps/typed/agenda/rv32-slot.S",
    "apps/typed/agenda/compile.js",
    "apps/typed/files/world.c",
    "apps/typed/files/wasm-slot.c",
    "apps/typed/files/rv32-slot.S",
    "apps/typed/files/slots.h",
    "apps/typed/files/compile.js",
    "bench/host/replays/files-rv32-driver.c",
]
NAMES = ["wasm-world.c", "agenda/wasm-slot.c", "files/wasm-slot.c", "agenda/rv32-slot.S", "files/rv32-slot.S",
         "files/slots.h", "agenda/compile.js", "files/compile.js", "files/world.c", "files-rv32-driver.c",
         "compileAgenda", "compileFiles", "agenda-reactor", "files-reactor"]


def git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def main():
    root = git("rev-parse", "--show-toplevel").strip()
    tracked = set(git("-C", root, "ls-files").splitlines())
    missing = [f for f in FILES if f not in tracked]
    assert not missing, f"not tracked: {missing}"
    assert len(FILES) == 10
    users = []
    for path in sorted(tracked - set(FILES)):
        if path.startswith("ttmp/"):
            continue
        try:
            text = open(f"{root}/{path}", encoding="utf-8").read()
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue
        users += [f"{path}: {name}" for name in NAMES if name in text]
    assert not users, "still referenced:\n  " + "\n  ".join(users)
    for f in FILES:
        print(("delete " if "--apply" in sys.argv else "would delete ") + f)
    if "--apply" in sys.argv:
        git("-C", root, "rm", "-q", *FILES)
        print(f"deleted {len(FILES)} files")


if __name__ == "__main__":
    main()
