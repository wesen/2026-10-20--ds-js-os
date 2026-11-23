#!/usr/bin/env python3
"""Split firmware/nucleus/kernel.c (1,117 lines) in four, with an internal header.

usage: python3 05-split-kernel-c.py [--dry-run | --revert]       (on a clean tree)

  kernel_internal.h     what the four files share and nothing else includes: the segment's clocks (apply_at,
                        frozen_now), the painter's allocation counters, and the functions one file calls in another
  kernel.c              the device profile, the event queue, logging, worlds, the lane, and kernel_reset (it empties
                        the queue, which stays private to kernel.c)
  kernel_channels.c     deferred effects, channels and asks
  kernel_supervision.c  supervision, apps from storage, booting a world (a segment) and booting the system
  kernel_reports.c      status and the JSON reports (worlds, handles, statistics)

Functions move unchanged; the ones another file calls lose `static` and are declared in kernel_internal.h. The build
lists (firmware/Makefile for both boards, the P4 and PaperS3 main/CMakeLists.txt) gain the three files.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from splitlib import Part, split  # noqa: E402

N = "firmware/nucleus/"
INCLUDES = """#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "kernel_internal.h"
#if PICOCALC_MOBILE_PAINTER
#include "../sdk/typed/chess-psix.h"
#endif
"""
HEADER = """// The kernel's own declarations, shared by kernel.c (the queue, logging, worlds, the lane), kernel_channels.c
// (deferred effects, channels, asks), kernel_supervision.c (crashes, restarts, apps, boot) and kernel_reports.c.
// Nothing outside those four files includes this.
#pragma once
#include "nucleus.h"

extern vtime_t apply_at;     // while a segment's effects are applied: the time it ended
extern vtime_t frozen_now;   // while a crash is handled: the time it happened
#if PICOCALC_MOBILE_PAINTER
extern unsigned painter_pending[2];   // allocations across deferred effects, events and mailboxes
#endif
"""
SHARED = [   # (file, the definition as written up to its brace): the functions another file calls (from the compiler)
    ("kernel.c", "static int restarts_of(world_t *W) {"),
    ("kernel.c", "static void uart_fault(world_t *W, const char *why, const char *detail) {"),
    ("kernel.c", "static bool channels_allowed(world_t *W) {"),
    ("kernel.c", "static bool alive(world_t *W) {"),
    ("kernel_channels.c", "static void apply_deferred(vtime_t at) {"),
    ("kernel_channels.c", "static void discard_deferred(void) {"),
    ("kernel_channels.c", "static void drop_retained(world_t *W) {"),
    ("kernel_channels.c", "static char *frame_message(world_t *W) {"),
    ("kernel_channels.c", "static void replay_retained(world_t *T) {"),
    ("kernel_channels.c", "static void settle_ask(int id, int ok, const char *json, const int *hs, int nh) {"),
    ("kernel_supervision.c", "static void clear_turn(world_t *W) {"),
    ("kernel_supervision.c", "static void start_timers(world_t *W, vtime_t at) {"),
    ("kernel_supervision.c", "static int boot_world(world_t *W) {"),
    ("kernel_reports.c", "static void publish_status(world_t *W, const char *state, const char *why, vtime_t in_us) {"),
]

PARTS = [
    Part(N + "kernel.c", [(1, 16), (22, 22), (29, 225), (715, 928), (994, 1029)],
         between={1: '#include "kernel_internal.h"\n#if PICOCALC_MOBILE_PAINTER\n#include "../sdk/typed/chess-psix.h"\n#endif\n\n',
                  2: "#if PICOCALC_MOBILE_PAINTER\nunsigned painter_pending[2];\n#endif\nvtime_t apply_at = -1;\nvtime_t frozen_now = -1;\n"}),
    Part(N + "kernel_channels.c", [(226, 451)],
         head="// Deferred effects (what a segment did, applied when it ends), channels and asks (kernel.c has the lane).\n" + INCLUDES + "\n"),
    Part(N + "kernel_supervision.c", [(463, 714), (929, 993)],
         head="// Supervision (crashes, backoff, restarts), apps from storage, booting a world and booting the system.\n" + INCLUDES + "\n"),
    Part(N + "kernel_reports.c", [(452, 462), (1030, 1117)],
         head="// Status and the JSON reports of worlds, handles and statistics that sys.read worlds ask for.\n" + INCLUDES + "\n"),
]
# 17 (nucleus.h, through kernel_internal.h), 18-20 (the painter include: re-created), 21 (blank), 23-28 (the statics,
# now defined without static in kernel.c and declared in kernel_internal.h)
MOVED = [(17, 21), (23, 28)]

EDITS = {}
for f, d in SHARED:
    EDITS.setdefault(N + f, []).append((d, d[len("static "):], 1))
HEADER_TAIL = "\n" + "".join(d[len("static "):].rstrip(" {") + ";\n" for f, d in SHARED)
PARTS.insert(0, Part(N + "kernel_internal.h", [], head=HEADER, tail=HEADER_TAIL))

EDITS["firmware/Makefile"] = [
    ("nucleus/agent_transport.c nucleus/kernel.c nucleus/vm", "nucleus/agent_transport.c nucleus/kernel.c nucleus/kernel_channels.c nucleus/kernel_supervision.c nucleus/kernel_reports.c nucleus/vm", 2),
    ("HDRS    := nucleus/nucleus.h ", "HDRS    := nucleus/nucleus.h nucleus/kernel_internal.h ", 2),
]
EDITS["firmware/port/esp32p4/main/CMakeLists.txt"] = [
    ('"${OS}/nucleus/kernel.c"', '"${OS}/nucleus/kernel.c" "${OS}/nucleus/kernel_channels.c" "${OS}/nucleus/kernel_supervision.c" "${OS}/nucleus/kernel_reports.c"', 1),
]
EDITS["firmware/port/esp32s3-papers3/main/CMakeLists.txt"] = [
    ('"${OS}/nucleus/kernel.c"', '"${OS}/nucleus/kernel.c" "${OS}/nucleus/kernel_channels.c" "${OS}/nucleus/kernel_supervision.c" "${OS}/nucleus/kernel_reports.c"', 1),
]

split(N + "kernel.c", PARTS, moved=MOVED, edits=EDITS)
