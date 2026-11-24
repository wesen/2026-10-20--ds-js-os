#!/usr/bin/env python3
"""Turn the checkout into the experiment tree of PICOCALC-COMPILER-DEVICE-COST, or back.

usage: 02-experiment-tree.py apply|revert

apply: copies exp/typed_cost_bench.c into bench/board/firmware/, adds the typedcost console command to the bench
console and bench.cmake (with typed/rv32-all.js, the three RV32 bundles concatenated), and gives typed_p4.c two
experiment knobs (p4_typed_strip_flags, p4_typed_bytecode_flush) and typed_compile_heap.c a third (p4_typed_park). Every edit is an exact, checked replacement.
Build the bench profile from the applied tree (it is recorded as dirty), then revert.
revert: restores the three edited files from git and deletes the copied file (checked: it must equal exp/'s).
"""
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
BENCH = REPO / "bench/board/firmware/typed_cost_bench.c"
EDITS = {
    "bench/board/firmware/bench_console.c": [
        ("bool p4_candela_bench_console(const char *args);     // candela_bench.c\n",
         "bool p4_candela_bench_console(const char *args);     // candela_bench.c\n"
         "void p4_typed_cost_console(const char *args);        // typed_cost_bench.c (experiment)\n"),
        ("  else if (!strcmp(cmd, \"typedmat\")) p4_typed_ray_material_console(args);\n",
         "  else if (!strcmp(cmd, \"typedmat\")) p4_typed_ray_material_console(args);\n"
         "  else if (!strcmp(cmd, \"typedcost\")) p4_typed_cost_console(args);\n"),
    ],
    "firmware/port/esp32p4/cmake/bench.cmake": [
        ("    ${bench_dir}/typed_ray_bench.c ${bench_dir}/typed_ray_material_bench.c ${bench_dir}/candela_bench.c)\n",
         "    ${bench_dir}/typed_ray_bench.c ${bench_dir}/typed_ray_material_bench.c ${bench_dir}/candela_bench.c\n"
         "    ${bench_dir}/typed_cost_bench.c)\n"
         "file(READ ${REPO}/compiler/typed/typed-rv32.js rv32_core)\n"
         "file(READ ${REPO}/compiler/typed/typed-rv32-inline.js rv32_inline)\n"
         "file(READ ${REPO}/compiler/typed/typed-rv32-loops.js rv32_loops)\n"
         "file(READ ${REPO}/compiler/typed/typed-rv32-kernel.js rv32_kernel)\n"
         "file(WRITE ${CMAKE_CURRENT_BINARY_DIR}/typed-rv32-all.js \"${rv32_core}${rv32_inline}${rv32_loops}${rv32_kernel}\")\n"
         "list(APPEND BUNDLE_EXTRA \"typed/rv32-all.js=${CMAKE_CURRENT_BINARY_DIR}/typed-rv32-all.js\")\n"),
    ],
    "firmware/port/esp32p4/main/typed_p4.c": [
        ("static bool eval_file(JSContext *ctx, const char *path) {\n",
         "// Experiment knobs (PICOCALC-COMPILER-DEVICE-COST): the compile runtimes' strip flags, and emptying the cache.\n"
         "int p4_typed_strip_flags = COMPILER_STRIP;\n"
         "void p4_typed_bytecode_flush(void) {\n"
         "  compiled_find(\"\", false);\n"
         "  xSemaphoreTake(compiled_lock, portMAX_DELAY);\n"
         "  for (size_t i = 0; i < sizeof(compiled_sources) / sizeof(*compiled_sources); i++) {\n"
         "    if (compiled_sources[i].bytes) port_heap_free(compiled_sources[i].bytes);\n"
         "    memset(&compiled_sources[i], 0, sizeof(compiled_sources[i]));\n"
         "  }\n"
         "  xSemaphoreGive(compiled_lock);\n"
         "}\n\n"
         "static bool eval_file(JSContext *ctx, const char *path) {\n"),
        # The production flags (COMPILER_STRIP, 4239fde) become the knob's default.
        ("  JS_SetStripInfo(rt, COMPILER_STRIP);\n",
         "  JS_SetStripInfo(rt, p4_typed_strip_flags);\n"),
    ],
    # Arena parking (7682d93) behind a knob, on by default as in production.
    "firmware/port/esp32p4/main/typed_compile_heap.c": [
        ("static void account(JSMallocState *state, size_t old, size_t current) {\n",
         "int p4_typed_park = 1;  // experiment knob (PICOCALC-COMPILER-DEVICE-COST)\n\n"
         "static void account(JSMallocState *state, size_t old, size_t current) {\n"),
        ("  bool arena = size >= ARENA_MIN && size <= ARENA_BLOCK;\n",
         "  bool arena = p4_typed_park && size >= ARENA_MIN && size <= ARENA_BLOCK;\n"),
        ("  if (usable >= ARENA_BLOCK && usable < ARENA_BLOCK + 64 && heap->parked_count < ARENA_PARKED) {\n",
         "  if (p4_typed_park && usable >= ARENA_BLOCK && usable < ARENA_BLOCK + 64 && heap->parked_count < ARENA_PARKED) {\n"),
    ],
}


def apply():
    assert not BENCH.exists(), f"{BENCH} exists: revert first"
    # revert restores these files from HEAD, so they must hold no uncommitted work.
    subprocess.run(["git", "-C", str(REPO), "diff", "--quiet", "HEAD", "--", *EDITS], check=True)
    for rel, edits in EDITS.items():
        path = REPO / rel
        text = path.read_text()
        for old, new in edits:
            assert text.count(old) == 1, f"{rel}: expected one {old!r}"
            text = text.replace(old, new)
        path.write_text(text)
    shutil.copyfile(HERE / "exp/typed_cost_bench.c", BENCH)
    print("applied:", ", ".join(EDITS), "and", BENCH.relative_to(REPO))


def revert():
    if BENCH.exists():
        assert BENCH.read_bytes() == (HERE / "exp/typed_cost_bench.c").read_bytes(), f"{BENCH} differs from exp/"
        BENCH.unlink()
    subprocess.run(["git", "-C", str(REPO), "checkout", "--", *EDITS], check=True)
    print("reverted")


if __name__ == "__main__":
    {"apply": apply, "revert": revert}[sys.argv[1]]()
