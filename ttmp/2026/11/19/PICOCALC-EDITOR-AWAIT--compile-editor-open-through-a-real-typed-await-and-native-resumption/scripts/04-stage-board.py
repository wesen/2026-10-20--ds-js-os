#!/usr/bin/env python3
"""Build two normal P4 boot images with on-device typed lowering and a native probe."""
import argparse
import json
from pathlib import Path
import runpy
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
REPO = DAY.parents[3]
BUILD = """set -eo pipefail
source "$1"
idf.py -C "$2" -B "$3" -D "SDKCONFIG=$2/sdkconfig.agent-elf" \
    -D "AWAIT_LIVE_SOURCE=$4" -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_RV32_AGENDA=ON -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_STREAM_FUNCTIONS=ON \
    -D PICOCALC_DEVICE_COMPILER=ON -D PICOCALC_COMPILER_PROFILE=ON -D PICOCALC_HEADLESS=OFF build
"""


def stage_board(output, study):
    output.mkdir(parents=True)
    stage = runpy.run_path(str(HERE / "01-stage.py"))
    replace = stage["replace"]
    os_source = REPO / "picocalc-os"
    tree = output / "tree"
    osdir = tree / "picocalc-os"
    osdir.mkdir(parents=True)
    (tree / "ttmp").symlink_to(REPO / "ttmp")
    for child in os_source.iterdir():
        if child.name not in {"compiler", "port"} and not child.name.startswith("build"):
            (osdir / child.name).symlink_to(child)
    shutil.copytree(os_source / "compiler", osdir / "compiler", symlinks=True)
    for field in ("wasm", "rv32", "async", "world"):
        shutil.copyfile(study / "lanes/manual/typed" / (field + ".js"),
                        osdir / "compiler" / ("typed-" + field + ".js"))
    port = osdir / "port/esp32p4"
    port.mkdir(parents=True)
    for child in (os_source / "port/esp32p4").iterdir():
        if child.name in {"main", "optional", "compiler", "managed_components"}:
            shutil.copytree(child, port / child.name, symlinks=True)
        elif child.is_file():
            shutil.copyfile(child, port / child.name)

    def edit(relative, old, new):
        path = port / relative
        path.write_text(replace(path.read_text(), old, new))

    edit("main/CMakeLists.txt", "PRIV_REQUIRES driver", "PRIV_REQUIRES mbedtls driver")
    edit("optional/native_elf/CMakeLists.txt", "REQUIRES elf_loader WHOLE_ARCHIVE)",
         "REQUIRES elf_loader PRIV_REQUIRES mbedtls WHOLE_ARCHIVE)")
    edit("main/CMakeLists.txt", '"editor/editor.typed=${editor_source}"',
         '"editor/editor.typed=${AWAIT_LIVE_SOURCE}"\n        "typed/async.js=${OS}/compiler/typed-async.js"')
    edit("main/CMakeLists.txt", '"${editor_manifest_path}" "${editor_reactor}" "${editor_source}" "${OS}/compiler/typed-world.js")',
         '"${editor_manifest_path}" "${editor_reactor}" "${AWAIT_LIVE_SOURCE}" '
         '"${OS}/compiler/typed-async.js" "${OS}/compiler/typed-world.js")')
    edit("main/typed_p4.c", "!eval_file(ctx, linker)) goto rejected;",
         '(!strcmp(linker, "typed/world.js") && !eval_file(ctx, "typed/async.js")) ||\n      !eval_file(ctx, linker)) goto rejected;')
    edit("main/editor_p4.c", '#include "p4.h"', '#include "p4.h"\n#include "mbedtls/sha256.h"')
    edit("main/editor_p4.c", "  free(reactor);", """  if (module) {
    unsigned char hash[32];
    if (!mbedtls_sha256((const unsigned char *)module, *length, hash, 0)) {
      printf("AWAITELF bytes=%zu sha256=", *length);
      for (unsigned i=0; i<sizeof hash; i++) printf("%02x", hash[i]);
      puts("");
    }
  }
  free(reactor);""")
    edit("main/main_p4.c", "void console_exec(char *line) {",
         "void p4_await_check(const char *mode);\n\nvoid console_exec(char *line) {")
    edit("main/main_p4.c", '  if (!strcmp(cmd, "stats")) kernel_stats_print();',
         '  if (!strcmp(cmd, "awaitcheck")) p4_await_check(rest);\n  else if (!strcmp(cmd, "stats")) kernel_stats_print();')
    native = "optional/native_elf/native_elf_p4.c"
    edit(native, "static int64_t k_call(", "static bool await_probe_active(const world_t *);\n\nstatic int64_t k_call(")
    edit(native, "  if (!W) return -1;", """  if (!W) return -1;
  if (await_probe_active(W)) {
    // A trial document must not modify the user's persistent Editor positions.
    if (op == NW_STORE_LOAD) { if (out_n) out[0] = 0; return 0; }
    if (op == NW_STORE_SAVE) return 0;
  }""")
    marker = "static int elf_event(world_t *W, const nw_event_t *e) {"
    edit(native, marker, (HERE / "03-physical-probe.c").read_text() + "\n" + marker)
    edit(native, "  int r = NW_DONE;\n  if (e->kind", "  int r = NW_DONE;\n  int issued_before = K.next_promise;\n  if (e->kind")
    edit(native, "  now = was;\n  vtime_t took = port_clock() - t0;",
         "  r = await_observe(W, e, x, issued_before, r);\n  now = was;\n  vtime_t took = port_clock() - t0;")
    return port


def build(output, study, idf):
    port = output / "tree/picocalc-os/port/esp32p4"
    if not port.exists():
        port = stage_board(output, study)
    work = output / "build"
    for lane in ("manual", "await"):
        artifact = output / lane
        artifact.mkdir(exist_ok=True)
        with (artifact / "build.log").open("wb") as log:
            subprocess.run(["bash", "-c", BUILD, "await-idf", idf, port, work, study / "lanes" / lane / "world.typed"],
                           stdout=log, stderr=subprocess.STDOUT, check=True)
        for name in ("picocalc-os-p4.bin", "partition_table/partition-table.bin", "esp-idf/main/typed-world-reactor.elf"):
            shutil.copyfile(work / name, artifact / Path(name).name)
    (output / "inputs.json").write_text(json.dumps({
        "study": str(study), "compiler": json.loads((study / "inputs.json").read_text()),
        "images": {lane: str(output / lane) for lane in ("manual", "await")}}, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("output", "study", "idf"):
        parser.add_argument(key, type=Path)
    args = parser.parse_args()
    build(args.output.resolve(), args.study.resolve(), args.idf.resolve())
