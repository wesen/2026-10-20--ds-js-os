#!/usr/bin/env python3
"""Build the boot study's arms from one commit: a ladder that adds this ticket's changes one at a time.

usage: 17-boot-arms.py build ARM BUILD_DIR ARM_DIR   apply ARM, build the playable profile, copy the flashable files
                                                     (app, bootloader, partition table, picocalc-build.json) into
                                                     ARM_DIR (which must not exist), revert
       17-boot-arms.py build-all BUILD_DIR PREFIX       every arm, into PREFIX-ARM
       17-boot-arms.py apply ARM | revert

ARM, each one change more than the one before:
  control  main's RV32 bundles (4e35068) (no kernel group; typed-rv32-kernel.js a stub nothing loads), no strip, no parking
  group    this tree's bundles (the kernel group), no strip, no parking
  strip    plus JS_STRIP_DEBUG (this tree's typed_p4.c without arena parking)
  final    plus arena parking: the commit as it is
Every edit is an exact, checked replacement; revert restores the edited files from git (they must be clean before).
The tree is recorded as dirty in picocalc-build.json for every arm but final.
"""
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
TYPED_P4 = "firmware/port/esp32p4/main/typed_p4.c"
BUNDLES = ["compiler/typed/typed-rv32.js", "compiler/typed/typed-rv32-loops.js", "compiler/typed/typed-rv32-kernel.js"]
FILES = [TYPED_P4, *BUNDLES]
NO_PARK = [
    ("  bool arena = size >= ARENA_MIN && size <= ARENA_BLOCK;\n",
     "  bool arena = false;  // boot-study arm without arena parking (PICOCALC-COMPILER-DEVICE-COST)\n"),
    ("  if (usable >= ARENA_BLOCK && usable < ARENA_BLOCK + 64 && heap->parked_count < ARENA_PARKED) {\n",
     "  if (false && usable >= ARENA_BLOCK && usable < ARENA_BLOCK + 64 && heap->parked_count < ARENA_PARKED) {\n"),
]
NO_STRIP = [("  JS_SetStripInfo(rt, COMPILER_STRIP);\n",
             "  JS_SetStripInfo(rt, 0);  // boot-study arm without stripping (PICOCALC-COMPILER-DEVICE-COST)\n")]
ARMS = {"control": NO_PARK + NO_STRIP, "group": NO_PARK + NO_STRIP, "strip": NO_PARK, "final": []}
MAIN = "4e35068"  # main as merged into 54dfe3b
ESP_IDF = Path.home() / "esp/esp-idf-5.4.2/export.sh"


def git(*args, **kw):
    return subprocess.run(["git", "-C", str(REPO), *args], check=True, **kw)


def apply(arm):
    git("diff", "--quiet", "HEAD", "--", *FILES)
    path = REPO / TYPED_P4
    text = path.read_text()
    for old, new in ARMS[arm]:
        assert text.count(old) == 1, f"{TYPED_P4}: expected one {old!r}"
        text = text.replace(old, new)
    path.write_text(text)
    if arm == "control":
        for rel in BUNDLES[:2]:
            (REPO / rel).write_bytes(git("show", MAIN + ":" + rel, capture_output=True).stdout)
        (REPO / BUNDLES[2]).write_text("// Boot-study control arm (PICOCALC-COMPILER-DEVICE-COST): main has no kernel group.\n"
                                       "globalThis.typedRv32Kernel = {group: \"kernel\"};\n")
    print("applied", arm)


def revert():
    git("checkout", "--", *FILES)
    print("reverted")


def build(arm, build_dir, arm_dir):
    arm_dir = Path(arm_dir)
    assert not arm_dir.exists(), f"{arm_dir} exists"
    apply(arm)
    try:
        subprocess.run(["bash", "-c", '. "$1" > /dev/null 2>&1 && exec "$2" playable "$3"', "build", str(ESP_IDF),
                        str(REPO / "firmware/port/esp32p4/build.sh"), str(build_dir)], check=True, cwd=REPO)
    finally:
        revert()
    build_dir = Path(build_dir)
    arm_dir.mkdir(parents=True)
    for rel in ("picocalc-os-p4.bin", "picocalc-build.json", "bootloader/bootloader.bin",
                "partition_table/partition-table.bin"):
        (arm_dir / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(build_dir / rel, arm_dir / rel)
    print(arm, "->", arm_dir, (arm_dir / "picocalc-build.json").read_text().strip())


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "build":
        build(*sys.argv[2:5])
    elif command == "build-all":  # build-all BUILD_DIR PREFIX: every arm, into PREFIX-ARM
        for arm in ("final", "strip", "group", "control"):
            build(arm, sys.argv[2], sys.argv[3] + "-" + arm)
    elif command == "apply":
        apply(sys.argv[2])
    elif command == "revert":
        revert()
    else:
        sys.exit(__doc__)
