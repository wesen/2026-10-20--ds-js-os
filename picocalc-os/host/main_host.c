// The host build: boots the system against the simulated board and runs a script that types on the
// keyboard, waits on the virtual clock and captures the panel as PNG.
//
//   picocalc-host [-j js] [-m manifest] [-o out] [-v] [-t ms] [script | -]
//
// Script commands (one per line, # starts a comment):
//   wait MS               run the system for MS virtual milliseconds
//   key NAME [HOLD_MS]    press and release a key (enter, esc, up, f1, a, ...); runs until released
//   type TEXT             type the text, one key every 90 ms
//   capture [FILE [SCALE]] write what the panel shows to OUT/FILE as PNG (default scale 2; shot-NNN.png)
//   battery PCT [charging]
//   crash WORLD           kill a world from outside, as a hardware fault would
//   stats                 print the worlds, the lane and the buses
//   panel                 print the panel controller's state
//   print TEXT            echo
//   quit
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include "../nucleus/nucleus.h"

static char out_dir[256] = "out";

static const struct { const char *name; int code; } KEYS[] = {
  { "enter", 0x0A }, { "return", 0x0A }, { "bs", 0x08 }, { "backspace", 0x08 }, { "tab", 0x09 }, { "esc", 0xB1 },
  { "left", 0xB4 }, { "up", 0xB5 }, { "down", 0xB6 }, { "right", 0xB7 }, { "space", 0x20 },
  { "f1", 0x81 }, { "f2", 0x82 }, { "f3", 0x83 }, { "f4", 0x84 }, { "f5", 0x85 }, { "f6", 0x86 }, { "f7", 0x87 },
  { "f8", 0x88 }, { "f9", 0x89 }, { "f10", 0x90 }, { "power", 0x91 }, { "break", 0xD0 }, { "insert", 0xD1 },
  { "home", 0xD2 }, { "del", 0xD4 }, { "end", 0xD5 }, { "pgup", 0xD6 }, { "pgdn", 0xD7 },
};

static int key_code(const char *n) {
  for (size_t i = 0; i < sizeof KEYS / sizeof KEYS[0]; i++) if (!strcasecmp(n, KEYS[i].name)) return KEYS[i].code;
  if (strlen(n) == 1) return (unsigned char)n[0];
  if (!strncmp(n, "0x", 2)) return (int)strtol(n, NULL, 16);
  return -1;
}

static void key_event(void *arg, int a) { (void)arg; stm32_key((uint8_t)(a & 0xff), a >> 8); }

// a press, a hold report if held long enough, a release; the system runs until the release
static void press(int code, int hold_ms) {
  vtime_t t = K.vnow;
  schedule_fn(t, key_event, NULL, code | 1 << 8);
  if (hold_ms >= 300) schedule_fn(t + MS(300), key_event, NULL, code | 2 << 8);
  schedule_fn(t + MS(hold_ms), key_event, NULL, code | 3 << 8);
  kernel_run_until(t + MS(hold_ms) + MS(10));
}

static void kill_world(void *arg, int a) { (void)a; world_t *W = arg; kernel_fault(W, "killed from the host"); }

static int run_line(char *line, int lineno) {
  char *p = line;
  while (isspace((unsigned char)*p)) p++;
  char *e = p + strlen(p);
  while (e > p && isspace((unsigned char)e[-1])) *--e = 0;
  if (!*p || *p == '#') return 0;
  char cmd[32] = "";
  int n = 0;
  sscanf(p, "%31s%n", cmd, &n);
  char *rest = p + n;
  while (isspace((unsigned char)*rest)) rest++;
  if (!strcmp(cmd, "wait") || !strcmp(cmd, "run")) kernel_run_until(K.vnow + MS(atof(rest)));
  else if (!strcmp(cmd, "key")) {
    char name[32] = ""; int hold = 60;
    sscanf(rest, "%31s %d", name, &hold);
    int c = key_code(name);
    if (c < 0) { fprintf(stderr, "line %d: no key called %s\n", lineno, name); return -1; }
    press(c, hold);
  } else if (!strcmp(cmd, "type")) {
    for (char *c = rest; *c; c++) { press((unsigned char)*c, 40); kernel_run_until(K.vnow + MS(40)); }
  } else if (!strcmp(cmd, "capture")) {
    static int shot = 0;
    char file[200] = ""; int scale = 2;
    sscanf(rest, "%199s %d", file, &scale);
    if (!file[0]) snprintf(file, sizeof file, "shot-%03d.png", ++shot);
    char path[512];
    snprintf(path, sizeof path, "%s/%s", out_dir, file);
    if (st7365p_capture_png(path, scale)) { fprintf(stderr, "cannot write %s\n", path); return -1; }
    printf("[%9.1f ms] captured %s\n", K.vnow / 1000.0, path);
  } else if (!strcmp(cmd, "battery")) {
    int pct = atoi(rest);
    stm32_battery(pct, strstr(rest, "charging") != NULL);
  } else if (!strcmp(cmd, "crash")) {
    world_t *W = world_by_name(rest);
    if (!W) { fprintf(stderr, "line %d: no world called %s\n", lineno, rest); return -1; }
    schedule_fn(K.vnow, kill_world, W, 0);
    kernel_run_until(K.vnow);
  } else if (!strcmp(cmd, "stats")) kernel_stats_print();
  else if (!strcmp(cmd, "panel")) st7365p_report();
  else if (!strcmp(cmd, "print")) printf("[%9.1f ms] %s\n", K.vnow / 1000.0, rest);
  else if (!strcmp(cmd, "quit")) return 1;
  else { fprintf(stderr, "line %d: unknown command %s\n", lineno, cmd); return -1; }
  fflush(stdout);
  return 0;
}

int main(int argc, char **argv) {
  const char *js = "js", *manifest = NULL, *script = NULL, *uart = NULL;
  double run_ms = 0;
  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "-j") && i + 1 < argc) js = argv[++i];
    else if (!strcmp(argv[i], "-m") && i + 1 < argc) manifest = argv[++i];
    else if (!strcmp(argv[i], "-o") && i + 1 < argc) snprintf(out_dir, sizeof out_dir, "%s", argv[++i]);
    else if (!strcmp(argv[i], "-u") && i + 1 < argc) uart = argv[++i];
    else if (!strcmp(argv[i], "-t") && i + 1 < argc) run_ms = atof(argv[++i]);
    else if (!strcmp(argv[i], "-v")) K.verbose = true;
    else if (!strcmp(argv[i], "-vv")) K.verbose = K.trace = true;
    else if (!strcmp(argv[i], "-h") || !strcmp(argv[i], "--help")) {
      printf("usage: %s [-j js_dir] [-m manifest] [-o out_dir] [-u uart_log] [-t ms] [-v | -vv] [script | -]\n", argv[0]);
      return 0;
    } else script = argv[i];
  }
  mkdir(out_dir, 0755);
  char mpath[512], upath[512];
  if (!manifest) { snprintf(mpath, sizeof mpath, "%s/system.json", js); manifest = mpath; }
  if (!uart) { snprintf(upath, sizeof upath, "%s/uart.log", out_dir); uart = upath; }
  sim_init();
  kernel_init(js, uart);
  if (kernel_boot(manifest)) return 1;
  int rc = 0;
  if (script) {
    FILE *f = strcmp(script, "-") ? fopen(script, "r") : stdin;
    if (!f) { fprintf(stderr, "cannot open %s\n", script); return 1; }
    char line[4096];
    int lineno = 0;
    while (fgets(line, sizeof line, f)) {
      int r = run_line(line, ++lineno);
      if (r < 0) { rc = 1; break; }
      if (r > 0) break;
    }
    if (f != stdin) fclose(f);
  } else kernel_run_until(MS(run_ms ? run_ms : 2000));
  kernel_shutdown();
  return rc;
}
