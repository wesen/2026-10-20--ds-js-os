// What the parts of the native-world engine share (native.c, native_json.c, native_device.c); nothing else includes
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

static inline int64_t fail(world_t *W, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
static inline int64_t fail(world_t *W, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt); vsnprintf(W->nat->err, sizeof W->nat->err, fmt, ap); va_end(ap);
  return -1;
}
// A call's string i as a NUL-terminated copy (the caller frees it).
static inline char *str(const nw_call_t *c, int i) {
  char *p = malloc(c->n[i] + 1);
  if (!p) return NULL;
  if (c->n[i]) memcpy(p, c->s[i], c->n[i]);
  p[c->n[i]] = 0;
  return p;
}
// A name (a world, a channel, a claim, a message type): 1 to max - 1 bytes and no NUL inside.
static inline bool name_ok(const nw_call_t *c, int i, size_t max) { return c->n[i] > 0 && c->n[i] < max && !memchr(c->s[i], 0, c->n[i]); }
static inline void charge(size_t n) { K.seg_cost += (vtime_t)(n * PROFILE.json_ns_per_byte / 1000.0); }
static inline bool in_list(char (*l)[NAME_LEN], int n, const char *s) { for (int i = 0; i < n; i++) if (!strcmp(l[i], s)) return true; return false; }

// The handles a payload names (bundled CJI modules only)
typedef struct { int ids[MAX_MSG_HANDLES], count; } grants_t;
#define BAD_JSON "the payload is not strict JSON (UTF-8, at most 64 deep, no \"$h\" keys)"

// native_json.c: payloads must be strict JSON before they reach another world
bool nat_json_ok(const char *s, size_t n, grants_t *grants);
bool payload_ok(const nw_call_t *c, int i);   // a call's string i, if present, is such a payload
bool text_ok(const nw_call_t *c, int i, size_t max);

// native_device.c: bundled CJI graphics, and the system calls on handles, files, the clock and the network
int64_t text_result(world_t *W, char *json, char *out, size_t cap);   // copies json (taking it) into out
int64_t cji_graphics(world_t *W, const nw_call_t *c, char *out, size_t cap);
#define NAT_NOT_DEVICE INT64_MIN   // what nat_syscall_device returns for any other operation
int64_t nat_syscall_device(world_t *W, const nw_call_t *c, char *out, size_t out_n);
