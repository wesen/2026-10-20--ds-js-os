#!/usr/bin/env python3
"""Remove the candela-typed firmware profile, which the playable profile now contains (PICOCALC-COMPILE-CACHE).

usage (repository root): python3 ttmp/.../scripts/02-remove-candela-typed-profile.py [--dry-run]

Checks before deleting: the file is the tracked profile, it lists exactly the playable apps plus candela-gallery,
and playable.env lists candela-gallery itself. Removes it with git rm, so the deletion is staged.
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
PROFILES = REPO / "firmware/port/esp32p4/profiles"
TARGET = PROFILES / "candela-typed.env"


def apps(path):
    for line in path.read_text().splitlines():
        if line.startswith("APPS=("):
            return line[len("APPS=("):-1].split()
    raise SystemExit(f"{path}: no APPS line")


def main():
    dry = "--dry-run" in sys.argv[1:]
    assert TARGET.is_file(), f"{TARGET}: not there"
    tracked = subprocess.run(["git", "-C", str(REPO), "ls-files", "--error-unmatch", str(TARGET)], capture_output=True)
    assert tracked.returncode == 0, f"{TARGET} is not tracked"
    playable, typed = apps(PROFILES / "playable.env"), apps(TARGET)
    assert "candela-gallery" in playable, f"playable.env does not list candela-gallery yet: {playable}"
    assert sorted(typed) == sorted(playable), f"candela-typed lists {typed}, playable {playable}"
    print(f"{'would remove' if dry else 'removing'} {TARGET.relative_to(REPO)} (apps {typed})")
    if not dry:
        subprocess.run(["git", "-C", str(REPO), "rm", "-q", str(TARGET.relative_to(REPO))], check=True)
        assert not TARGET.exists()


if __name__ == "__main__":
    main()
