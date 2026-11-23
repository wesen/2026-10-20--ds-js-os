#!/usr/bin/env python3
"""Split firmware/nucleus/native.c (836 lines): native worlds' engine functions and system calls.

usage: python3 07-split-native-c.py [--dry-run | --revert]       (on a clean tree)

  native_internal.h  the helpers every part uses (fail, str, name_ok, charge, in_list: now static inline), the
                     grants a payload names, and what one part calls in another
  native.c           the engine functions, the store, and nat_syscall: checks, messages, asks, timers, the screen
  native_json.c      payload validation: strict JSON with capability markers, user-visible text
  native_device.c    bundled CJI graphics, and the system calls on devices: handles, files, clock, network

The device calls were the first cases of nat_syscall's switch (CJI_HANDLE_INFO to NW_NET_JOIN). They move unchanged
into nat_syscall_device's switch, which nat_syscall calls just before its own; an operation that is not one of them
returns NAT_NOT_DEVICE and goes on to the remaining cases, as before. No moved case breaks out of the switch.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from splitlib import Part, split  # noqa: E402

N = "firmware/nucleus/"
INCLUDES = """#include <limits.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "native_internal.h"
"""
HEADER = """// What the parts of the native-world engine share (native.c, native_json.c, native_device.c); nothing else includes
// this. The call helpers are static inline: each part has its own copy, as when they were one file's statics.
#pragma once
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"
#include "../sdk/nw_wire.h"

"""
HEADER_MID = """
// The handles a payload names (bundled CJI modules only)
"""
HEADER_TAIL = """
// native_json.c: payloads must be strict JSON before they reach another world
bool nat_json_ok(const char *s, size_t n, grants_t *grants);
bool payload_ok(const nw_call_t *c, int i);   // a call's string i, if present, is such a payload
bool text_ok(const nw_call_t *c, int i, size_t max);

// native_device.c: bundled CJI graphics, and the system calls on handles, files, the clock and the network
int64_t text_result(world_t *W, char *json, char *out, size_t cap);   // copies json (taking it) into out
int64_t cji_graphics(world_t *W, const nw_call_t *c, char *out, size_t cap);
#define NAT_NOT_DEVICE INT64_MIN   // what nat_syscall_device returns for any other operation
int64_t nat_syscall_device(world_t *W, const nw_call_t *c, char *out, size_t out_n);
"""
DEVICE_OPEN = """
// The system calls on handles, files, the clock and the network (nat_syscall tries these first).
int64_t nat_syscall_device(world_t *W, const nw_call_t *c, char *out, size_t out_n) {
  switch (c->op) {
"""
DEVICE_CLOSE = """  }
  return NAT_NOT_DEVICE;
}
"""
CALL_DEVICE = """  int64_t device = nat_syscall_device(W, c, out, out_n);
  if (device != NAT_NOT_DEVICE) return device;
"""
PARTS = [
    Part(N + "native_internal.h", [(117, 133), (140, 140), (262, 262)], head=HEADER, between={1: HEADER_MID}, tail=HEADER_TAIL),
    Part(N + "native.c", [(1, 13), (16, 116), (277, 288), (398, 419), (420, 420), (600, 836)],
         between={1: '#include "native_internal.h"\n', 4: CALL_DEVICE}),
    Part(N + "native_json.c", [(135, 139), (141, 261), (263, 276)],
         head="// Payloads: strict JSON (with capability markers for bundled CJI modules) and user-visible text, checked before\n"
              "// they reach another world or the screen (native worlds; native.c has the system calls).\n" + INCLUDES + "\n"),
    Part(N + "native_device.c", [(289, 397), (421, 599)],
         head="// Native worlds' system calls on devices: bundled CJI graphics, handles, files, the clock and the network.\n" + INCLUDES + "\n",
         between={1: DEVICE_OPEN}, tail=DEVICE_CLOSE),
]
# 14-15 (nucleus.h, nw_wire.h) come through native_internal.h; 134 is a blank line.
MOVED = [(14, 15), (134, 134)]

H = N + "native_internal.h"
EDITS = {
    H: [
        ("static int64_t fail(world_t *W, const char *fmt, ...)", "static inline int64_t fail(world_t *W, const char *fmt, ...)", 2),
        ("static char *str(const nw_call_t *c, int i) {", "static inline char *str(const nw_call_t *c, int i) {", 1),
        ("static bool name_ok(", "static inline bool name_ok(", 1),
        ("static void charge(size_t n) {", "static inline void charge(size_t n) {", 1),
        ("static bool in_list(", "static inline bool in_list(", 1),
    ],
    N + "native_json.c": [
        ("static bool nat_json_ok(const char *s, size_t n, grants_t *grants) {", "bool nat_json_ok(const char *s, size_t n, grants_t *grants) {", 1),
        ("// A call's string i, if present, must be such a payload.\nstatic bool payload_ok(", "// A call's string i, if present, must be such a payload.\nbool payload_ok(", 1),
        ("static bool text_ok(const nw_call_t *c, int i, size_t max) {", "bool text_ok(const nw_call_t *c, int i, size_t max) {", 1),
    ],
    N + "native_device.c": [
        ("static int64_t text_result(world_t *W, char *json, char *out, size_t cap) {", "int64_t text_result(world_t *W, char *json, char *out, size_t cap) {", 1),
        ("static int64_t cji_graphics(world_t *W, const nw_call_t *c, char *out, size_t cap) {", "int64_t cji_graphics(world_t *W, const nw_call_t *c, char *out, size_t cap) {", 1),
    ],
    "firmware/Makefile": [
        ("nucleus/native.c nucleus/native_wasm.c", "nucleus/native.c nucleus/native_json.c nucleus/native_device.c nucleus/native_wasm.c", 2),
        ("HDRS    := nucleus/nucleus.h ", "HDRS    := nucleus/nucleus.h nucleus/native_internal.h ", 2),
    ],
    "firmware/port/esp32p4/main/CMakeLists.txt": [
        ('"${OS}/nucleus/native.c"', '"${OS}/nucleus/native.c" "${OS}/nucleus/native_json.c" "${OS}/nucleus/native_device.c"', 1),
    ],
}
split(N + "native.c", PARTS, moved=MOVED, edits=EDITS)
