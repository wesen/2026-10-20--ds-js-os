#!/usr/bin/env python3
"""Build a disposable port with the staged lowerer and a real 80 KiB Editor reservation."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

CONTROL = "40bcf850a5809ef6d839127869faa952596ed157"
REPO = Path(__file__).resolve().parents[6]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(path, marker, replacement):
    text = path.read_text()
    assert text.count(marker) == 1, marker
    path.write_text(text.replace(marker, replacement))


def add_editor_receipt(main):
    replace_once(main / "CMakeLists.txt", "PRIV_REQUIRES driver", "PRIV_REQUIRES mbedtls driver")
    wrapper = main / "editor_p4.c"
    replace_once(wrapper, '#include "p4.h"', '#include "p4.h"\n#include "mbedtls/sha256.h"')
    marker = "  free(reactor);"
    replacement = """  if (module) {
    unsigned char digest[32];
    if (mbedtls_sha256((const unsigned char *)module, *length, digest, 0) == 0) {
      const char *digits = "0123456789abcdef";
      char hex[65];
      for (unsigned i = 0; i < sizeof(digest); ++i) {
        hex[2 * i] = digits[digest[i] >> 4];
        hex[2 * i + 1] = digits[digest[i] & 15];
      }
      hex[64] = 0;
      printf("SLOT80 editor bytes=%zu sha256=%s\\n", *length, hex);
    } else {
      puts("SLOT80 editor hash failed");
    }
  }
  free(reactor);"""
    replace_once(wrapper, marker, replacement)


def stage(staged, output):
    subprocess.run(["git", "diff", "--quiet", CONTROL, "--", "picocalc-os"], cwd=REPO, check=True)
    src = REPO / "picocalc-os"
    tree = output / "tree"
    os = tree / "picocalc-os"
    os.mkdir(parents=True)
    (tree / "ttmp").symlink_to(REPO / "ttmp", target_is_directory=True)
    for child in src.iterdir():
        if child.name not in {"port", "compiler", "sdk"} and not child.name.startswith("build"):
            (os / child.name).symlink_to(child)
    for name in ("compiler", "sdk"):
        shutil.copytree(src / name, os / name, symlinks=True)
    for part in ("wasm", "rv32", "world"):
        shutil.copyfile(staged / "lanes/staged/typed" / f"{part}.js", os / "compiler" / f"typed-{part}.js")
    slot = os / "sdk/typed/rv32-slot.S"
    text = slot.read_text()
    key = ".space 229376 - (.-.Lprogram)"
    assert text.count(key) == 1
    slot.write_text(text.replace(key, ".space 81920 - (.-.Lprogram)"))

    source_port = src / "port/esp32p4"
    port = os / "port/esp32p4"
    port.mkdir(parents=True)
    for name in ("main", "optional", "compiler", "managed_components"):
        shutil.copytree(source_port / name, port / name, symlinks=True)
    for path in source_port.iterdir():
        if path.is_file():
            shutil.copyfile(path, port / path.name)
    add_editor_receipt(port / "main")
    info = {"control": CONTROL, "slotBytes": 81920,
            "candidateSha256": digest(os / "compiler/typed-rv32.js"), "slotSourceSha256": digest(slot)}
    (output / "inputs.json").write_text(json.dumps(info, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("staged", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    stage(args.staged.resolve(), args.output.resolve())
