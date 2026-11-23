#!/usr/bin/env python3
"""Split firmware/nucleus/vm_mqjs.c (1,039 lines), the MicroQuickJS binding (PaperS3), in three, with a header.

usage: python3 08-split-vm-mqjs-c.py [--dry-run | --revert]       (on a clean tree)

  vm_mqjs.h        what the three share: struct vmw, WORLD, op_fn, the helpers and the operations of vm_mqjs_gfx.c
  vm_mqjs.c        the engine's log, work counting, argument helpers, calls into the world, the prelude, the
                   lifecycle, the manifest, calibration
  vm_mqjs_ops.c    a world's own, message, handle and hardware operations, the operation table with __k and its
                   profile, the asynchronous operations (__ka)
  vm_mqjs_gfx.c    pixels, the system operations, the clock and the store

Functions move unchanged; those called from another file lose `static` and are declared in vm_mqjs.h. The table
SYNC_OPS keeps its order (vm_op_prof indexes it).
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from splitlib import REPO, Part, split  # noqa: E402

N = "firmware/nucleus/"
SRC = (REPO / (N + "vm_mqjs.c")).read_text().splitlines(keepends=True)
INCLUDES = """#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vm_mqjs.h"
"""
HEADER = """// The MicroQuickJS binding's own declarations, shared by vm_mqjs.c (runtime and lifecycle), vm_mqjs_ops.c (the
// operation table, __k, __ka and most operations) and vm_mqjs_gfx.c (pixels, system, clock and store operations).
// Nothing outside those three files includes this.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include "nucleus.h"
#include "mquickjs.h"

"""
# helpers in vm_mqjs.c that the operation files call (from the compiler's errors)
HELPERS = [
    "static int iarg(JSContext *ctx, JSValue *argv, int argc, int i, int def) {",
    "static double darg(JSContext *ctx, JSValue *argv, int argc, int i, double def) {",
    "static char *sarg(JSContext *ctx, JSValue *argv, int argc, int i) {",
    "static int int_list(JSContext *ctx, JSValue *argv, int argc, int i, int *out, int max) {",
    "static pixel_t color_arg(JSContext *ctx, JSValue *argv, int argc, int i) {",
    "static JSValue fail(JSContext *ctx, const char *fmt, ...) {",
    "static JSValue json_value(JSContext *ctx, char *json) {",
    "static void charge_json(size_t n) {",
    "static bool check_grants(JSContext *ctx, world_t *W, const int *hs, int nh) {",
]
# the operations of vm_mqjs_gfx.c (lines 398-610) that the table names, and what __ka calls there
OP = re.compile(r"^(static JSValue (op_\w+)\(JSContext \*ctx, world_t \*W, int argc, JSValue \*argv\) \{)")
GFX_OPS = [m.group(1) for line in SRC[397:610] if (m := OP.match(line))]
GFX_OTHER = ["static void run_poweroff(deferred_t *d, vtime_t at) {"]

def decl(d):
    return d[len("static "):].rstrip(" {") + ";\n"

OPS_SHARED = ["static handle_t *use(JSContext *ctx, world_t *W, int id, int type, int right) {"]
HEADER_TAIL = ("\n// vm_mqjs.c: the engine log's sink while an error is formatted, argument helpers\n"
               "extern sbuf_t *log_sink;\n" + "".join(decl(d) for d in HELPERS) +
               "\n// vm_mqjs_ops.c: handles; the host functions (mqjs_stdlib.h, included by vm_mqjs.c, names them)\n" +
               "".join(decl(d) for d in OPS_SHARED) +
               "JSValue js_nucleus_k(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv);\n"
               "JSValue js_nucleus_ka(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv);\n"
               "\n// vm_mqjs_gfx.c: pixels, system, clock and store operations; the wall clock's offset (clock.set)\n"
               "extern double wall_offset_ms;\n" + "".join(decl(d) for d in GFX_OPS + GFX_OTHER))
PARTS = [
    Part(N + "vm_mqjs.h", [(17, 23), (158, 159)], head=HEADER, tail=HEADER_TAIL),
    Part(N + "vm_mqjs.c", [(1, 13), (24, 157), (733, 1039)], between={1: '#include "vm_mqjs.h"\n\n'}),
    Part(N + "vm_mqjs_ops.c", [(161, 397), (611, 732)],
         head="// A world's own, message, handle and hardware operations, the operation table with __k, and the asynchronous\n"
              "// operations (__ka): the MicroQuickJS binding (vm_mqjs.c has the runtime, vm_mqjs_gfx.c the rest).\n" + INCLUDES + "\n"),
    Part(N + "vm_mqjs_gfx.c", [(398, 610)],
         head="// Pixels, the system's operations, the clock and a world's store: the MicroQuickJS binding (vm_mqjs_ops.c has\n"
              "// the table that names them).\n" + INCLUDES + "\n"),
]
# 14-15 (nucleus.h, mquickjs.h) through vm_mqjs.h; 16 blank; 160 blank
MOVED = [(14, 16), (160, 160)]
EDITS = {N + "vm_mqjs.c": [(d, d[len("static "):], 1) for d in HELPERS + ["static sbuf_t *log_sink;"]],
         N + "vm_mqjs_ops.c": [(d, d[len("static "):], 1) for d in OPS_SHARED],
         N + "vm_mqjs_gfx.c": [(d, d[len("static "):], 1) for d in GFX_OPS + GFX_OTHER + ["static double wall_offset_ms = WALL_BOOT_MS;"]]}
# fail's prototype with its format attribute moves to the header
EDITS[N + "vm_mqjs.c"].append(("static JSValue fail(JSContext *ctx, const char *fmt, ...) __attribute__((format(printf, 2, 3)));\n", "", 1))
HEADER_TAIL = HEADER_TAIL.replace("JSValue fail(JSContext *ctx, const char *fmt, ...);", "JSValue fail(JSContext *ctx, const char *fmt, ...) __attribute__((format(printf, 2, 3)));")
PARTS[0].tail = HEADER_TAIL
EDITS["firmware/Makefile"] = [
    ("nucleus/vm_mqjs.c", "nucleus/vm_mqjs.c nucleus/vm_mqjs_ops.c nucleus/vm_mqjs_gfx.c", 1),
    ("sdk/nw_wire.h nucleus/font_paper.h", "sdk/nw_wire.h nucleus/vm_mqjs.h nucleus/font_paper.h", 1),   # the PaperS3's HDRS
]
EDITS["firmware/port/esp32s3-papers3/main/CMakeLists.txt"] = [
    ('"${OS}/nucleus/vm_mqjs.c"', '"${OS}/nucleus/vm_mqjs.c" "${OS}/nucleus/vm_mqjs_ops.c" "${OS}/nucleus/vm_mqjs_gfx.c"', 1),
]
split(N + "vm_mqjs.c", PARTS, moved=MOVED, edits=EDITS)
