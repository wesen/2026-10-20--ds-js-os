// dial: a native app with a screen (PICOCALC-APPUI). A level from 0 to 100, set with the arrow keys, shown as a
// number, a bar and a gauge drawn on a canvas, with counters for keys and seconds. The same source runs as a host
// process, as WebAssembly and as P4 machine code: it uses the SDK, nw_json.h, nw_ui.h, snprintf and strcmp, and no
// maths library (the gauge's points come from a table).
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include "nw.h"
#include "nw_json.h"
#include "nw_ui.h"

#if defined(__wasm__)
#define BUILT_AS "WebAssembly"
#elif defined(__riscv)
#define BUILT_AS "machine code"
#else
#define BUILT_AS "a host process"
#endif

// A gauge in a 40 x 30 box: five lines for the half circle, a base, a needle and its hub.
#define ICON "[[\"line\",4,24,7,15],[\"line\",7,15,15,9],[\"line\",15,9,25,9],[\"line\",25,9,33,15]," \
             "[\"line\",33,15,36,24],[\"fill\",2,26,36,2],[\"line\",20,24,28,12,\"accent\"],[\"fill\",18,22,5,5]]"

static int level = 50, keys, seconds;

// ---- the gauge -------------------------------------------------------------------------------------------------
// A half circle on a canvas, level 0 on the left and 100 on the right, in 20 steps of 9 degrees. C9[k] is the cosine
// of 9k degrees times 1000; the sine of 9k degrees is C9[10 - k].
enum { GW = 220, GH = 120, CX = 110, CY = 110, R = 100 };
static const short C9[11] = { 1000, 988, 951, 891, 809, 707, 588, 454, 309, 156, 0 };

// The point at step i (0..20) along the half circle, at radius r.
static void arc(int i, int r, int *x, int *y) {
  int c = i <= 10 ? C9[i] : -C9[20 - i], s = i <= 10 ? C9[10 - i] : C9[i - 10];
  *x = CX - r * c / 1000;
  *y = CY - r * s / 1000;
}

// The point for a level (0..100) at radius r: on the chord between two steps.
static void at(int lv, int r, int *x, int *y) {
  int i = lv / 5, f = lv % 5, x0, y0, x1, y1;
  arc(i, r, &x0, &y0);
  arc(i < 20 ? i + 1 : 20, r, &x1, &y1);
  *x = x0 + (x1 - x0) * f / 5;
  *y = y0 + (y1 - y0) * f / 5;
}

static char canvas[3072];
static int clen;

static void add(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  if (clen < (int)sizeof canvas) clen += vsnprintf(canvas + clen, sizeof canvas - clen, fmt, ap);
  va_end(ap);
}

// The canvas node: the half circle, the part up to the level in the accent colour (three pixels wide), ticks at
// 0, 25, 50, 75 and 100, their labels, and the needle. Returns 0 if it did not fit.
static int gauge(void) {
  int x, y;
  clen = 0;
  add("{\"t\":\"canvas\",\"w\":%d,\"h\":%d,\"ops\":[[\"poly\",[", GW, GH);
  for (int i = 0; i <= 20; i++) { arc(i, R, &x, &y); add("%s%d,%d", i ? "," : "", x, y); }
  add("],\"line\"]");
  for (int r = R; r > R - 3; r--) {
    add(",[\"poly\",[");
    for (int i = 0; i * 5 <= level; i++) { arc(i, r, &x, &y); add("%s%d,%d", i ? "," : "", x, y); }
    at(level, r, &x, &y);
    add(",%d,%d],\"accent\"]", x, y);
  }
  for (int i = 0; i <= 20; i += 5) {
    int x0, y0;
    arc(i, R - 10, &x0, &y0);
    arc(i, R - 4, &x, &y);
    add(",[\"line\",%d,%d,%d,%d,\"muted\"]", x0, y0, x, y);
  }
  add(",[\"text\",%d,%d,\"0\",\"s\",\"muted\"]", CX - R + 14, CY - 14);
  add(",[\"text\",%d,%d,\"50\",\"s\",\"muted\"]", CX - 6, CY - R + 14);
  add(",[\"text\",%d,%d,\"100\",\"s\",\"muted\"]", CX + R - 32, CY - 14);
  at(level, R - 18, &x, &y);
  add(",[\"line\",%d,%d,%d,%d,\"ink\"],[\"line\",%d,%d,%d,%d,\"ink\"]", CX, CY, x, y, CX + 1, CY, x + 1, y);
  add(",[\"fill\",%d,%d,9,9,\"ink\"]]}", CX - 4, CY - 4);
  return clen < (int)sizeof canvas;
}

// ---- the screen ------------------------------------------------------------------------------------------------
static void show(void) {
  static char buf[6144];
  char num[8], bar[96], kv[192];
  nw_ui u;
  snprintf(num, sizeof num, "%d", level);
  snprintf(bar, sizeof bar, "{\"t\":\"bar\",\"v\":%d.%02d,\"h\":10,\"color\":\"accent\"}", level / 100, level % 100);
  snprintf(kv, sizeof kv, "{\"t\":\"kv\",\"pairs\":[[\"keys\",\"%d\"],[\"seconds\",\"%d\"],[\"built as\",\"%s\"]]}",
           keys, seconds, BUILT_AS);
  nw_ui_begin(&u, buf, sizeof buf);
  nw_ui_open(&u, "col", "\"gap\":8");
  nw_ui_open(&u, "row", 0);
  nw_ui_text(&u, "Level", "\"font\":\"l\"");
  nw_ui_text(&u, num, "\"font\":\"xl\",\"align\":\"right\",\"color\":\"accent\"");
  nw_ui_close(&u);
  nw_ui_node(&u, bar);
  if (gauge()) nw_ui_node(&u, canvas);
  nw_ui_node(&u, kv);
  nw_ui_close(&u);
  if (nw_ui_end(&u) >= 0) nw_screen(buf, "←→ 1  ↑↓ 10  0 zero");
  else nw_log("dial: the screen does not fit its buffer");
}

// ---- the world -------------------------------------------------------------------------------------------------
void nw_init(void) {
  nw_kind("app");
  nw_title("Dial");
  nw_key("n");
  nw_about("A native app in C: one source, run as WebAssembly, as machine code or as a process.");
  nw_icon(ICON);
  nw_every(1000);
}

int nw_on_event(const nw_event *e) {
  if (e->kind == NW_TICK) seconds++;
  else if (e->kind == NW_MESSAGE && !strcmp(e->type, "key")) {
    char k[16], ch[8];
    if (nw_json_str(e->json, "key", k, sizeof k) < 0) return NW_DONE;
    if (nw_json_str(e->json, "ch", ch, sizeof ch) < 0) ch[0] = 0;
    keys++;
    if (!strcmp(k, "right")) level += 1;
    else if (!strcmp(k, "left")) level -= 1;
    else if (!strcmp(k, "up")) level += 10;
    else if (!strcmp(k, "down")) level -= 10;
    else if (!strcmp(ch, "0")) level = 0;
    level = level < 0 ? 0 : level > 100 ? 100 : level;
  } else if (e->kind != NW_START) return NW_DONE;
  show();
  return NW_DONE;
}
