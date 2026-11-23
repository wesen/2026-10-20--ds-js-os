#!/usr/bin/env python3
"""Split firmware/nucleus/vm.c (1,266 lines), the QuickJS binding, in three, with an internal header.

usage: python3 04-split-vm-c.py [--dry-run]       (on a clean tree)

  vm_quickjs.h  what the three files share: the per-world binding state (struct vmw), the operation type, the helpers
  vm.c          the allocator, work counting, the lifecycle (create, dispatch, settle, dispose), the manifest,
                calibration
  vm_ops.c      errors, argument helpers, and the operations a world performs on itself, on messages, handles,
                hardware, files and graphics, with their name table (VM_OPS)
  vm_sys.c      the system, network, storage and agent operations with theirs, and the two host functions __k and
                __ka: __k looks an operation up in VM_OPS, then in vm_sys.c's table

Functions move unchanged. The helpers the other files call lose `static` and are declared in vm_quickjs.h; the
operations stay static, each file's in its own table. The one table SYNC_OPS becomes two (the same names and
functions; a lookup tries vm_ops.c's first). The build lists (firmware/Makefile, the P4 main
CMakeLists.txt) gain the two files.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from splitlib import Part, split  # noqa: E402

N = "firmware/nucleus/"
INCLUDES = """#include <stdarg.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vm_quickjs.h"
"""
HEADER = """// The QuickJS binding's own declarations, shared by vm.c (runtime and lifecycle), vm_ops.c (a world's operations on
// itself, messages, handles and graphics) and vm_sys.c (system, network, storage and agent operations; __k and __ka).
// Nothing outside those three files includes this.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include "nucleus.h"
#include "quickjs.h"

"""
HEADER_TAIL = """
// vm_ops.c: errors and argument helpers
const char *vm_exception(JSContext *ctx, char *buf, size_t n);
void set_error(world_t *W);
int iarg(JSContext *ctx, JSValueConst *argv, int argc, int i, int def);
double darg(JSContext *ctx, JSValueConst *argv, int argc, int i, double def);
char *sarg(JSContext *ctx, JSValueConst *argv, int argc, int i);   // a copy, or NULL
int int_list(JSContext *ctx, JSValueConst v, int *out, int max);
pixel_t color_arg(JSContext *ctx, JSValueConst *argv, int argc, int i);
JSValue fail(JSContext *ctx, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
JSValue json_value(JSContext *ctx, char *json);   // takes ownership
void charge_json(size_t n);
bool check_grants(JSContext *ctx, world_t *W, const int *hs, int nh);
handle_t *use(JSContext *ctx, world_t *W, int id, int type, int right);
JSValue ka_fs(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, JSValue *p);

// An operation's name and function; vm_ops.c's table (vm_sys.c has the rest)
typedef struct { const char *name; op_fn fn; } vm_op_t;
extern const vm_op_t VM_OPS[];
extern const size_t VM_N_OPS;

// vm_sys.c: promises, the system operations the async host function needs, and the host functions
int vm_new_promise(world_t *W, JSValue *out);
JSValue ka_spawn(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, JSValue *p);
JSValue host_k(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
JSValue host_ka(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
"""
OPS_HEAD = """// A world's operations on itself (time, identity, log), on messages and turns, on handles, hardware and files, and on
// its framebuffer (QuickJS binding; vm.c has the runtime, vm_sys.c the system operations and the host functions).
""" + INCLUDES + "\n"
OPS_TAIL = """
// The operations above by name; vm_sys.c's __k looks a name up here first.
const vm_op_t VM_OPS[] = {
#if PICOCALC_RAYTRACE
  { "gfx.raytrace", op_gfx_raytrace },
#endif
  { "gfx.text", op_gfx_text }, { "gfx.fill", op_gfx_fill }, { "gfx.rect", op_gfx_rect }, { "gfx.line", op_gfx_line },
  { "gfx.commit", op_gfx_commit }, { "gfx.fonts", op_gfx_fonts }, { "gfx.invalidate", op_gfx_invalidate },
  { "now", op_now }, { "clock.wall", op_clock_wall }, { "clock.zone", op_clock_zone }, { "clock.setzone", op_clock_setzone }, { "send", op_send }, { "publish", op_publish }, { "log", op_log }, { "self", op_self }, { "seed", op_seed },
  { "turn.async", op_turn_async }, { "turn.done", op_turn_done }, { "turn.fail", op_turn_fail }, { "turn.reject", op_turn_reject },
  { "hw.i2c", op_hw_i2c }, { "hw.spi", op_hw_spi }, { "dma.alloc", op_dma_alloc },
  { "h.info", op_h_info }, { "h.attenuate", op_h_attenuate }, { "h.revoke", op_h_revoke }, { "h.release", op_h_release },
  { "hw.fs", op_hw_fs }, { "fs.at", op_fs_at },
};
const size_t VM_N_OPS = sizeof VM_OPS / sizeof VM_OPS[0];
"""
SYS_HEAD = """// The system's operations (worlds, handles, statistics, logs, spawning, faults), the network's, a world's store and
// the agent's; then the two host functions every operation is reached through (QuickJS binding).
""" + INCLUDES + "\n"
SYS_TABLE = """static const vm_op_t SYS_OPS[] = {
  { "sys.worlds", op_sys_worlds }, { "sys.handles", op_sys_handles }, { "sys.stats", op_sys_stats }, { "sys.log", op_sys_log }, { "sys.spawn", op_sys_spawn }, { "sys.stop", op_sys_stop },
  { "net.info", op_net_info }, { "net.scan", op_net_scan }, { "net.scanresult", op_net_scan_result }, { "net.join", op_net_join },
  { "sys.fault", op_sys_fault }, { "sys.restart", op_sys_restart },
  { "store.load", op_store_load }, { "store.save", op_store_save }, { "store.status", op_store_status },
  { "agent.status", op_agent_status }, { "agent.start", op_agent_start }, { "agent.poll", op_agent_poll }, { "agent.cancel", op_agent_cancel },
};

static op_fn find_op(const char *op) {
  for (size_t i = 0; i < VM_N_OPS; i++) if (!strcmp(op, VM_OPS[i].name)) return VM_OPS[i].fn;
  for (size_t i = 0; i < sizeof SYS_OPS / sizeof SYS_OPS[0]; i++) if (!strcmp(op, SYS_OPS[i].name)) return SYS_OPS[i].fn;
  return NULL;
}

JSValue host_k(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  world_t *W = WORLD;
  if (argc < 1) return fail(ctx, "__k needs an operation");
  const char *op = JS_ToCString(ctx, argv[0]);
  if (!op) return JS_EXCEPTION;
  op_fn fn = find_op(op);
  if (fn) {
    JS_FreeCString(ctx, op);
    K.seg_cost += 1;   // a host call costs about a microsecond
    return fn(ctx, W, argc - 1, argv + 1);
  }
  JSValue r = fail(ctx, "no such kernel operation: %s", op);
  JS_FreeCString(ctx, op);
  return r;
}
"""
PARTS = [
    Part(N + "vm_quickjs.h", [(17, 27), (216, 217)], head=HEADER, tail=HEADER_TAIL),
    # vm.c: the file comment, the C library includes, then (instead of nucleus.h and quickjs.h) vm_quickjs.h
    Part(N + "vm.c", [(1, 10), (13, 16), (28, 108), (901, 1266)], between={1: '#include "vm_quickjs.h"\n'}),
    Part(N + "vm_ops.c", [(110, 215), (218, 392), (394, 519)], head=OPS_HEAD, tail=OPS_TAIL),
    Part(N + "vm_sys.c", [(520, 782), (817, 900)], head=SYS_HEAD, between={1: SYS_TABLE + "\n"}),
]
# Lines 11-12 (nucleus.h, quickjs.h) are included through vm_quickjs.h; 109 is a blank line; 393 (a forward declaration
# of vm_new_promise) is in vm_quickjs.h; 783-816 (SYNC_OPS and host_k) are OPS_TAIL's table and SYS_TABLE.
MOVED = [(11, 12), (109, 109), (393, 393), (783, 816)]

STATIC = [  # (file, definition as written, count) -> without static
    ("vm_ops.c", "static const char *vm_exception(JSContext *ctx, char *buf, size_t n) {", 1),
    ("vm_ops.c", "static void set_error(world_t *W) {", 1),
    ("vm_ops.c", "static int iarg(JSContext *ctx, JSValueConst *argv, int argc, int i, int def) {", 1),
    ("vm_ops.c", "static double darg(JSContext *ctx, JSValueConst *argv, int argc, int i, double def) {", 1),
    ("vm_ops.c", "static char *sarg(JSContext *ctx, JSValueConst *argv, int argc, int i) {", 1),
    ("vm_ops.c", "static int int_list(JSContext *ctx, JSValueConst v, int *out, int max) {", 1),
    ("vm_ops.c", "static pixel_t color_arg(JSContext *ctx, JSValueConst *argv, int argc, int i) {", 1),
    ("vm_ops.c", "static JSValue fail(JSContext *ctx, const char *fmt, ...) {", 1),
    ("vm_ops.c", "static JSValue json_value(JSContext *ctx, char *json) {", 1),
    ("vm_ops.c", "static void charge_json(size_t n) {", 1),
    ("vm_ops.c", "static bool check_grants(JSContext *ctx, world_t *W, const int *hs, int nh) {", 1),
    ("vm_ops.c", "static handle_t *use(JSContext *ctx, world_t *W, int id, int type, int right) {", 1),
    ("vm_ops.c", "static JSValue ka_fs(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, JSValue *p) {", 1),
    ("vm_sys.c", "static JSValue ka_spawn(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, JSValue *p) {", 1),
    ("vm_sys.c", "static int vm_new_promise(world_t *W, JSValue *out) {", 1),
    ("vm_sys.c", "static JSValue host_ka(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {", 1),
]
EDITS = {}
for f, d, c in STATIC:
    EDITS.setdefault(N + f, []).append((d, d[len("static "):], c))
# fail's separate prototype (the format attribute) is in vm_quickjs.h now
EDITS[N + "vm_ops.c"].append(("static JSValue fail(JSContext *ctx, const char *fmt, ...) __attribute__((format(printf, 2, 3)));\n", "", 1))
EDITS["firmware/Makefile"] = [
    ("nucleus/kernel.c nucleus/vm.c nucleus/hw.c", "nucleus/kernel.c nucleus/vm.c nucleus/vm_ops.c nucleus/vm_sys.c nucleus/hw.c", 1),
    ("  HDRS    := nucleus/nucleus.h nucleus/raytrace_demo.h", "  HDRS    := nucleus/nucleus.h nucleus/vm_quickjs.h nucleus/raytrace_demo.h", 1),
]
EDITS["firmware/port/esp32p4/main/CMakeLists.txt"] = [
    ('"${OS}/nucleus/kernel.c" "${OS}/nucleus/vm.c"', '"${OS}/nucleus/kernel.c" "${OS}/nucleus/vm.c" "${OS}/nucleus/vm_ops.c" "${OS}/nucleus/vm_sys.c"', 1),
]

split(N + "vm.c", PARTS, moved=MOVED, edits=EDITS)
