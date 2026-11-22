// Writing a screen for nw_screen: a tree of ui nodes as JSON, the same nodes JavaScript's ui.* builds (js/prelude.js).
// Like nw_json.h it allocates nothing and uses no C library, so it works in every build of a native world.
//
//   char buf[4096]; nw_ui u;
//   nw_ui_begin(&u, buf, sizeof buf);
//   nw_ui_open(&u, "col", "\"gap\":6");          {"t":"col","gap":6,"kids":[      a node with children
//   nw_ui_text(&u, "Dial", "\"font\":\"l\"");     {"t":"text","s":"Dial","font":"l"}
//   nw_ui_node(&u, "{\"t\":\"bar\",\"v\":0.5}");  any node, written as JSON by the caller
//   nw_ui_close(&u);                              ]}
//   if (nw_ui_end(&u) >= 0) nw_screen(buf, "←→ level");
//
// opts are the node's other members as JSON ("\"font\":\"l\",\"color\":\"accent\""), or 0. Strings given to
// nw_ui_text and nw_ui_str are escaped; everything else is written as it is. nw_ui_end returns the length, or -1 if
// the buffer was too small or the nodes are not closed, and the caller does not show a broken tree.
//
// Nodes (see js/system/compositor.js): col, row, box (kids; gap, pad); text (s; font s|m|mb|l|xl, color, align,
// wrap); gap (h); sep; bar (v from 0 to 1; label); spark (values); kv (pairs [[k, v], ...]); list (items [{label}],
// sel); lines (items); canvas (w, h, ops: ["fill"|"rect", x, y, w, h, colour], ["line", x1, y1, x2, y2, colour],
// ["text", x, y, "s", font, colour], ["poly", [x0, y0, x1, y1, ...], colour]).
#pragma once
#include "nw_json.h"

#define NW_UI_DEPTH 16
typedef struct {
  char *buf;
  int n, len, depth, bad;
  unsigned char kids[NW_UI_DEPTH];   // nodes written so far at each depth, for the commas
} nw_ui;

static inline void nw_ui__raw(nw_ui *u, const char *s) {
  for (; *s && !u->bad; s++) {
    if (u->len >= u->n - 1) { u->bad = 1; return; }
    u->buf[u->len++] = *s;
  }
  if (!u->bad) u->buf[u->len] = 0;
}
static inline void nw_ui__next(nw_ui *u) { if (u->kids[u->depth]++) nw_ui__raw(u, ","); }

static inline void nw_ui_begin(nw_ui *u, char *buf, int n) {
  u->buf = buf; u->n = n; u->len = 0; u->depth = 0; u->bad = n < 2; u->kids[0] = 0;
  if (n > 0) buf[0] = 0;
}

// A JSON string literal, escaped, where a value is expected (inside opts the caller writes its own).
static inline void nw_ui_str(nw_ui *u, const char *s) {
  if (u->bad) return;
  int k = nw_json_quote(u->buf + u->len, u->n - u->len, s);
  if (k < 0) { u->bad = 1; return; }
  u->len += k;
}

static inline void nw_ui_open(nw_ui *u, const char *type, const char *opts) {
  nw_ui__next(u);
  nw_ui__raw(u, "{\"t\":\""); nw_ui__raw(u, type); nw_ui__raw(u, "\"");
  if (opts && *opts) { nw_ui__raw(u, ","); nw_ui__raw(u, opts); }
  nw_ui__raw(u, ",\"kids\":[");
  if (u->depth + 1 >= NW_UI_DEPTH) { u->bad = 1; return; }
  u->kids[++u->depth] = 0;
}

static inline void nw_ui_close(nw_ui *u) {
  if (u->depth <= 0) { u->bad = 1; return; }
  u->depth--;
  nw_ui__raw(u, "]}");
}

static inline void nw_ui_text(nw_ui *u, const char *s, const char *opts) {
  nw_ui__next(u);
  nw_ui__raw(u, "{\"t\":\"text\",\"s\":");
  nw_ui_str(u, s);
  if (opts && *opts) { nw_ui__raw(u, ","); nw_ui__raw(u, opts); }
  nw_ui__raw(u, "}");
}

static inline void nw_ui_node(nw_ui *u, const char *json) { nw_ui__next(u); nw_ui__raw(u, json); }

static inline int nw_ui_end(nw_ui *u) { return u->bad || u->depth != 0 || u->kids[0] != 1 ? -1 : u->len; }
