// The host build: boots the system against a simulated board (sim/ for the PicoCalc, sim/papers3/ for the
// PaperS3) and runs a script that works its inputs, waits on the virtual clock and captures the panel as PNG.
//
//   picocalc-host [-j js] [-m manifest] [-o out] [-s store] [-v] [-t ms] [script | -]
//
// Script commands (one per line, # starts a comment):
//   wait MS               run the system for MS virtual milliseconds
//   capture [FILE [SCALE [OPTS]]] write what the panel shows to OUT/FILE as PNG (default scale 2; shot-NNN.png)
//   crash WORLD           kill a world from outside, as a hardware fault would
//   stats                 print the worlds, the lane and the buses
//   panel                 print the panel controller's state
//   send WORLD TYPE [JSON] deliver a message to a world, from outside
//   print TEXT            echo
//   power                 press the power button: a board that switched itself off boots again
//   quit
// and the board's own (host/board.h): on the PicoCalc key NAME [HOLD_MS], type TEXT, battery PCT [charging];
// on the PaperS3 tap X Y, hold X Y MS, swipe X0 Y0 X1 Y1 [MS], type TEXT, battery PCT [charging].
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include "../nucleus/nucleus.h"
#include "board.h"

static char out_dir[256] = "out";
static const char *js_root, *manifest_path;

// ---- power: a board that switches itself off (sys.powerOff) halts the kernel; the runner then resets it and lets
// the board's time pass until the power button (the "power" command) or the board (its RTC) switches it on again,
// and boots the kernel from scratch, as the device cold-boots. The glass, the clock and the store are the board's
// and stay.
static bool off;
static void power_on(const char *why) {
  board_wake(why);
  kernel_init(js_root, NULL);   // the console log stays open
  if (kernel_boot(manifest_path)) exit(1);
  off = false;
  printf("[%9.1f ms] the board is on (%s)\n", board_now() / 1000.0, why);
}
static void check_halted(void) {
  if (!K.halted || off) return;
  printf("[%9.1f ms] the board is off\n", board_now() / 1000.0);
  board_off();
  kernel_reset();
  off = true;
}
// us of the board's time: the kernel runs while the board is on; while it is off, until something switches it on
static void pass(vtime_t us) {
  vtime_t end = board_now() + us;
  for (;;) {
    if (!off) {
      kernel_run_until(K.vnow + (end - board_now()));
      check_halted();
      if (!off) return;
    }
    vtime_t wake = board_next_wake();
    if (wake > end) { board_pass(end - board_now()); return; }
    board_pass(wake - board_now());
    power_on("rtc");
  }
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
  static const char *const WHILE_OFF[] = { "wait", "run", "capture", "print", "quit", "power", "panel", "battery", NULL };
  bool allowed = !off;
  for (int i = 0; !allowed && WHILE_OFF[i]; i++) allowed = !strcmp(cmd, WHILE_OFF[i]);
  if (!allowed) { printf("[%9.1f ms] the board is off: %s does nothing\n", board_now() / 1000.0, cmd); return 0; }
  if (!strcmp(cmd, "wait") || !strcmp(cmd, "run")) pass(MS(atof(rest)));
  else if (!strcmp(cmd, "power")) {
    if (off) { power_on("button"); kernel_run_until(K.vnow); }
    else printf("[%9.1f ms] the board is on: the power button does nothing here\n", board_now() / 1000.0);
  }
  else if (!strcmp(cmd, "capture")) {
    static int shot = 0;
    char file[200] = "", opts[64] = ""; int scale = 2;
    sscanf(rest, "%199s %d %63s", file, &scale, opts);
    if (!file[0]) snprintf(file, sizeof file, "shot-%03d.png", ++shot);
    char path[512];
    snprintf(path, sizeof path, "%s/%s", out_dir, file);
    if (board_capture(path, scale, opts)) { fprintf(stderr, "cannot write %s\n", path); return -1; }
    printf("[%9.1f ms] captured %s\n", board_now() / 1000.0, path);
  } else if (!strcmp(cmd, "crash")) {
    world_t *W = world_by_name(rest);
    if (!W) { fprintf(stderr, "line %d: no world called %s\n", lineno, rest); return -1; }
    schedule_fn(K.vnow, kill_world, W, 0);
    kernel_run_until(K.vnow);
  } else if (!strcmp(cmd, "send")) {   // send WORLD TYPE [JSON]: a message from outside, as the console can
    char to[NAME_LEN] = "", type[NAME_LEN] = ""; int m = 0;
    sscanf(rest, "%31s %31s %n", to, type, &m);
    world_t *W = world_by_name(to);
    if (!W || !type[0]) { fprintf(stderr, "line %d: send WORLD TYPE [JSON]\n", lineno); return -1; }
    defer_deliver(W, new_msg(M_ON, type, m && rest[m] ? rest + m : NULL, -1));
    kernel_run_until(K.vnow);
  } else if (!strcmp(cmd, "stats")) kernel_stats_print();
  else if (!strcmp(cmd, "panel")) board_report();
  else if (!strcmp(cmd, "print")) printf("[%9.1f ms] %s\n", board_now() / 1000.0, rest);
  else if (!strcmp(cmd, "quit")) return 1;
  else {
    int r = board_command(cmd, rest, lineno);
    if (r < 0) return -1;
    if (r == 0) { fprintf(stderr, "line %d: unknown command %s (this board also has: %s)\n", lineno, cmd, board_commands_help); return -1; }
  }
  check_halted();   // the command's run may have switched the board off
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
    else if (!strcmp(argv[i], "-s") && i + 1 < argc) host_store_dir(argv[++i]);   // the persistent store in files
    else if (!strcmp(argv[i], "-t") && i + 1 < argc) run_ms = atof(argv[++i]);
    else if (!strcmp(argv[i], "-v")) K.verbose = true;
    else if (!strcmp(argv[i], "-vv")) K.verbose = K.trace = true;
    else if (!strcmp(argv[i], "-h") || !strcmp(argv[i], "--help")) {
      printf("usage: %s [-j js_dir] [-m manifest] [-o out_dir] [-u uart_log] [-s store_dir] [-t ms] [-v | -vv] [script | -]\n", argv[0]);
      return 0;
    } else script = argv[i];
  }
  mkdir(out_dir, 0755);
  char mpath[512], upath[512];
  if (!manifest) { snprintf(mpath, sizeof mpath, "%s/system.json", js); manifest = mpath; }
  if (!uart) { snprintf(upath, sizeof upath, "%s/uart.log", out_dir); uart = upath; }
  js_root = js; manifest_path = manifest;
  board_init();
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
  } else pass(MS(run_ms ? run_ms : 2000));
  kernel_shutdown();
  return rc;
}
