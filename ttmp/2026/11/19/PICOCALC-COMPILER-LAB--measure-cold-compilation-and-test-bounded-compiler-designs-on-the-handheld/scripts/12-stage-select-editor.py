"""Build a normal Editor boot using the exact Select compiler from the paired experiment."""
import argparse
import json
from pathlib import Path
import runpy

HERE = Path(__file__).resolve().parent
stage = runpy.run_path(str(HERE / "01-stage.py"))["stage"]
DIGEST = "06a85ff63c94a9d193a9136f92a2250e6725c5f9df830e9c00aa643d96503944"
WRAPPER = """#include <stddef.h>
#include <stdio.h>
#include "mbedtls/sha256.h"

const char *lab_front = "exp/select/wasm.js";
const char *lab_back = "exp/select/rv32.js";
extern char *lab_editor_compile(size_t *);

char *p4_editor_compile(size_t *length) {
    char *module = lab_editor_compile(length);
    if (module) {
        unsigned char digest[32];
        if (mbedtls_sha256((const unsigned char *)module, *length, digest, 0) == 0) {
            char hex[65];
            for (size_t i = 0; i < sizeof digest; i++)
                snprintf(hex + 2 * i, 3, "%02x", (unsigned)digest[i]);
            printf("LIVE editor bytes=%zu sha256=%s\\n", *length, hex);
        }
    }
    return module;
}
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paired", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    paired = args.paired.resolve()
    result = json.loads((paired / "oracle.json").read_text())["select"]["editor"]
    assert result["sha256"] == DIGEST and result["bytes"] == 240452
    stage(args.output, {"base": None, "select": paired / "lanes/select"})
    paired_sources = json.loads((paired / "lanes.json").read_text())["select"]
    fresh_sources = json.loads((args.output / "lanes.json").read_text())["select"]
    assert fresh_sources == paired_sources
    target = args.output / "tree/picocalc-os/port/esp32p4/main/lab_trials.c"
    target.write_text(WRAPPER)
    (args.output / "editor-oracle.json").write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
