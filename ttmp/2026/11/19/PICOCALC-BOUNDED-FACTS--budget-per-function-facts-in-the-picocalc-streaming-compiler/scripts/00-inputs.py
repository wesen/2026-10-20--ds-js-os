#!/usr/bin/env python3
"""Copy only the requested phase's typed sources from the frozen revision."""
import argparse
from pathlib import Path
import subprocess

REVISION = "40bcf850a5809ef6d839127869faa952596ed157"


def read(path):
    return subprocess.check_output(["git", "show", f"{REVISION}:picocalc-os/worlds/{path}"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("phase", choices=("training", "held-out"))
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    if args.phase == "training":
        (args.directory / "files.typed").write_bytes(read("files/files.typed"))
        agenda = b"\n".join(read("agenda/" + part) for part in ("reminder.typed", "entry.typed"))
        (args.directory / "agenda.typed").write_bytes(agenda)
    else:
        editor = b"".join(read("editor/" + part) + b"\n" for part in read("editor/source.list").decode().split())
        (args.directory / "editor.typed").write_bytes(editor)


if __name__ == "__main__":
    main()
