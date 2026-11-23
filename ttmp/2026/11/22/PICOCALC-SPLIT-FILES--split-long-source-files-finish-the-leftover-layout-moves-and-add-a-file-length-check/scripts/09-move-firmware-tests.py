#!/usr/bin/env python3
"""Move the firmware's own tests to tests/apps and tests/native (PICOCALC-REPO-LAYOUT Section 10, leftover).

usage: python3 09-move-firmware-tests.py [--dry-run]       (on a clean tree)

  firmware/tests/*.test.mjs                     -> tests/apps/      Node tests of the QuickJS apps and system worlds
  firmware/tests/*.py                           -> tests/native/    Python tests that drive the host binary
  firmware/tests/fixtures/{agent,agent-chat}    -> tests/native/fixtures/

Not moved: firmware/tests/fixtures/{cji-grants,cji-phase3}. They are inputs of the P4 build (main/CMakeLists.txt,
which PICOCALC-TYPED-APP-MANIFEST is rewriting), not test data; they move with that file.

The Node tests' URLs (../../apps/js/...) resolve to the same files from tests/apps. The Python tests keep OS (and
agent-integration.py's ROOT) as the firmware directory, so every OS-relative path stays as it was; only their own
location and the fixtures' change. The firmware Makefile runs them from firmware/ as ../tests/{apps,native}/...
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
DRY = sys.argv[1:] == ["--dry-run"]
assert sys.argv[1:] in ([], ["--dry-run"]), __doc__

T = REPO / "firmware/tests"
APPS = sorted(p.name for p in T.glob("*.test.mjs"))
NATIVE = sorted(p.name for p in T.glob("*.py"))
assert len(APPS) == 7 and len(NATIVE) == 7, (APPS, NATIVE)
MOVES = ([(f"firmware/tests/{n}", f"tests/apps/{n}") for n in APPS] + [(f"firmware/tests/{n}", f"tests/native/{n}") for n in NATIVE] +
         [(f"firmware/tests/fixtures/{d}", f"tests/native/fixtures/{d}") for d in ("agent", "agent-chat")])

EDITS = {}


def edit(path, old, new, count=1):
    EDITS.setdefault(path, []).append((old, new, count))


PARENTS = 'OS = Path(__file__).resolve().parents[1]\n'
for n in ("test_agent_native.py", "test_fs_native.py", "test_native_worlds.py"):
    edit(f"tests/native/{n}", PARENTS, 'OS = Path(__file__).resolve().parents[2] / "firmware"   # the firmware tree\n')
AI = "tests/native/agent-integration.py"
edit(AI, "ROOT = Path(__file__).resolve().parents[1]\n", 'ROOT = Path(__file__).resolve().parents[2] / "firmware"   # the firmware tree\n')
edit(AI, "ROOT / 'tests/fixtures/agent'", "ROOT / '../tests/native/fixtures/agent'")
edit(AI, "ROOT / 'tests/fixtures/agent-chat'", "ROOT / '../tests/native/fixtures/agent-chat'")
edit("tests/native/test_agent_native.py", "  make && python3 tests/test_agent_native.py\n", "  make && python3 ../tests/native/test_agent_native.py\n")
edit("tests/native/test_agent_native.py", "  make AGENT_LIVE=1 && python3 tests/test_agent_native.py --live\n", "  make AGENT_LIVE=1 && python3 ../tests/native/test_agent_native.py --live\n")
MK = "firmware/Makefile"
for n in APPS:
    edit(MK, f"$(NODE) tests/{n}", f"$(NODE) ../tests/apps/{n}")
for n in NATIVE:
    edit(MK, f"$(PYTHON) tests/{n}", f"$(PYTHON) ../tests/native/{n}", None)
edit(".gitignore", "firmware/tests/__pycache__/\n", "tests/native/__pycache__/\n")
edit("tools/file-length-exceptions.txt", "firmware/tests/calc.test.mjs -- ", "tests/apps/calc.test.mjs -- ")
edit("firmware/README.md", "PICOCALC_AGENT_FIXTURES=tests/fixtures/agent ", "PICOCALC_AGENT_FIXTURES=../tests/native/fixtures/agent ")
edit("apps/tours/agent/tour.txt", "PICOCALC_AGENT_FIXTURES=tests/fixtures/agent ", "PICOCALC_AGENT_FIXTURES=../tests/native/fixtures/agent ")
DA = "docs/agent/picocalc-agent-implementation.md"
edit(DA, "PICOCALC_AGENT_FIXTURES=tests/fixtures/agent \\", "PICOCALC_AGENT_FIXTURES=../tests/native/fixtures/agent \\")
edit(DA, "python3 tests/agent-integration.py", "python3 ../tests/native/agent-integration.py", 2)
edit(DA, "| `tests` and `tests/fixtures/agent` |", "| `../tests/apps`, `../tests/native` and `../tests/native/fixtures/agent` |")
for c in ("wprobe.c", "wimport.c", "echo.c", "probe.c"):
    edit(f"firmware/natives/{c}", "for tests/test_native_worlds.py", "for tests/native/test_native_worlds.py")


def main():
    if not DRY:
        dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=REPO, capture_output=True, text=True).stdout
        dirty = [l for l in dirty.splitlines() if not l[3:].startswith("ttmp/")]
        assert not dirty, "commit first: " + "\n".join(dirty)
    for src, dest in MOVES:
        assert (REPO / src).exists() and not (REPO / dest).exists(), (src, dest)
        print(("would move" if DRY else "move"), src, "->", dest)
        if not DRY:
            (REPO / dest).parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "mv", src, dest], cwd=REPO, check=True)
    moved = {d: s for s, d in MOVES}
    for path, reps in EDITS.items():
        src = path
        if DRY:   # read the file where it is now
            for s, d in MOVES:
                if path == d:
                    src = s
        text = (REPO / src).read_text()
        for old, new, count in reps:
            found = text.count(old)
            assert (found >= 1 if count is None else found == count), (path, old, found, count)
            text = text.replace(old, new)
        print(("would edit" if DRY else "edit"), path, len(reps))
        if not DRY:
            (REPO / path).write_text(text)
            subprocess.run(["git", "add", path], cwd=REPO, check=True)
    left = sorted(str(p.relative_to(REPO)) for p in T.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    print("left in firmware/tests:", left if DRY else left)


if __name__ == "__main__":
    main()
