"""Reuse the existing workflow drivers with the frontend image identity rule."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
DAY = HERE.parents[1]
ROOT = HERE.parents[5]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("gcc", type=Path)
    parser.add_argument("emulator", type=Path)
    args = parser.parse_args()

    work = args.work.resolve()
    scripts, = DAY.glob("PICOCALC-RV32-BRANCH--*/scripts")
    scratch = work / "identity-guest"
    local = scratch / "scripts"
    local.mkdir(parents=True)
    pair = scratch / "pair"
    pair.mkdir()
    (pair / "baseline").symlink_to(work / "lanes/base")
    (pair / "candidate").symlink_to(work / "lanes/cursor")
    shutil.copyfile(scripts / "05-guest.py", local / "05-guest.py")

    linker = (scripts / "03-apps.mjs").read_text()
    baseline = "assert.notEqual(modules.baseline.sha256, modules.candidate.sha256);"
    assert linker.count(baseline) == 1
    (local / "03-apps.mjs").write_text(
        linker.replace(baseline, "assert.equal(modules.baseline.sha256, modules.candidate.sha256);")
    )
    subprocess.run([sys.executable, "-B", local / "05-guest.py",
                    args.gcc.resolve(), args.emulator.resolve(), pair], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
