// The host build: boots the system against a simulated board (sim/ for the PicoCalc, sim/papers3/ for the
// PaperS3) and runs a script that works its inputs, waits on the virtual clock and captures the panel as PNG.
//
//   picocalc-host [-j js] [-m manifest] [-o out] [-v] [-t ms] [script | -]
//
// Script commands (one per line, # starts a comment):
//   wait MS               run the system for MS virtual milliseconds
//   capture [FILE [SCALE [OPTS]]] write what the panel shows to OUT/FILE as PNG (default scale 2; shot-NNN.png)
//   crash WORLD           kill a world from outside, as a hardware fault would
//   stats                 print the worlds, the lane and the buses
//   panel                 print the panel controller's state
//   print TEXT            echo
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
  else if (!strcmp(cmd, "capture")) {
    static int shot = 0;
    char file[200] = "", opts[64] = ""; int scale = 2;
    sscanf(rest, "%199s %d %63s", file, &scale, opts);
    if (!file[0]) snprintf(file, sizeof file, "shot-%03d.png", ++shot);
    char path[512];
    snprintf(path, sizeof path, "%s/%s", out_dir, file);
    if (board_capture(path, scale, opts)) { fprintf(stderr, "cannot write %s\n", path); return -1; }
    printf("[%9.1f ms] captured %s\n", K.vnow / 1000.0, path);
  } else if (!strcmp(cmd, "crash")) {
    world_t *W = world_by_name(rest);
    if (!W) { fprintf(stderr, "line %d: no world called %s\n", lineno, rest); return -1; }
    schedule_fn(K.vnow, kill_world, W, 0);
    kernel_run_until(K.vnow);
  } else if (!strcmp(cmd, "stats")) kernel_stats_print();
  else if (!strcmp(cmd, "panel")) board_report();
  else if (!strcmp(cmd, "print")) printf("[%9.1f ms] %s\n", K.vnow / 1000.0, rest);
  else if (!strcmp(cmd, "quit")) return 1;
  else {
    int r = board_command(cmd, rest, lineno);
    if (r < 0) return -1;
    if (r == 0) { fprintf(stderr, "line %d: unknown command %s (this board also has: %s)\n", lineno, cmd, board_commands_help); return -1; }
  }
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
  } else kernel_run_until(MS(run_ms ? run_ms : 2000));
  kernel_shutdown();
  return rc;
}
