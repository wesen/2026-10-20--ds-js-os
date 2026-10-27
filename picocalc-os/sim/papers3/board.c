// The simulated M5Stack PaperS3: the GT911 touch controller and the BM8563 clock on i2c1, the e-paper panel on
// its own bus (epd0), the battery on ADC1 channel 2 and the charger's status on GPIO4; and the script commands
// that work them.
//
//   tap X Y                     a finger down and up 80 ms later
//   hold X Y MS                 a finger held down
//   swipe X0 Y0 X1 Y1 [MS]      a finger moved from one point to another (default 250 ms), then lifted
//   battery PCT [charging]      what the battery and the charger report
//   capture FILE [SCALE [clean]]  the glass; "clean" leaves the ghosts out
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "papers3.h"
#include "../../host/board.h"

const char *board_commands_help = "tap X Y | hold X Y MS | swipe X0 Y0 X1 Y1 [MS] | battery PCT [charging]";

static struct { int pct; bool charging; } B = { 82, false };

void board_init(void) { srand(1); gt911_init(); bm8563_init(WALL_BOOT_MS); epd_init(); }
const char *const *port_bus_names(void) { static const char *const b[] = { "i2c1", "epd0", NULL }; return b; }
const char *port_board_name(void) { return "M5Stack PaperS3 (simulated)"; }

// the battery: 3.30 V empty to 4.20 V full, roughly linear in between, halved by the divider at the pin
int port_adc_read_mv(int unit, int channel) {
  if (unit != 1 || channel != 2) return 0;
  int mv = 3300 + B.pct * 9 + (B.charging ? 60 : 0);
  return mv / 2;
}
int port_gpio_get(int pin) {
  if (pin == PIN_TOUCH_INT) return !gt911_int(K.vnow);
  return pin == 4 ? !B.charging : 0;   // the charger pulls it low while charging
}
char *port_epd_info(void) { return xstrdup("{\"w\":540,\"h\":960,\"grays\":16,\"modes\":[\"quality\",\"text\",\"fast\",\"fastest\"]}"); }

// ---- the touch controller's interrupt line (GPIO48) ---------------------------------------------------------
// The GT911 makes reports on its own schedule (at a finger event, then every 10 ms while one is down) and holds
// INT low while one waits. A watched pin that is armed turns that into kernel_irq; the kernel masks it (here:
// armed = false) until the world's turn ends and port_gpio_arm runs. All on the virtual clock.
static struct { int handle; bool armed, ticking; } T;
static void int_check(void) {
  if (T.handle && T.armed && gt911_int(K.vnow)) { T.armed = false; kernel_irq(T.handle, K.vnow); }
}
static void touch_tick(void *arg, int a) {
  (void)arg; (void)a;
  int_check();
  if (gt911_active()) schedule_fn(K.vnow + MS(10), touch_tick, NULL, 0);
  else T.ticking = false;
}
int port_gpio_watch(int pin, int mode, int handle_id) {
  if (pin != PIN_TOUCH_INT || (mode != IRQ_LOW && mode != IRQ_FALLING)) return -1;   // only the touch line interrupts here
  T.handle = handle_id; T.armed = true;
  int_check();
  return 0;
}
void port_gpio_arm(int pin, int mode) { (void)mode; if (pin == PIN_TOUCH_INT && T.handle) { T.armed = true; int_check(); } }
void port_gpio_unwatch(int pin) { if (pin == PIN_TOUCH_INT) T.handle = 0; }

// ---- fingers ----------------------------------------------------------------------------------------------
static void finger(void *arg, int a) {
  (void)arg;
  gt911_finger(0, a >> 30 & 1, a & 0x7fff, a >> 15 & 0x7fff, K.vnow);
  int_check();
  if (!T.ticking && gt911_active()) { T.ticking = true; schedule_fn(K.vnow + MS(10), touch_tick, NULL, 0); }
}
static void at(vtime_t t, bool down, int x, int y) {
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x >= PANEL_W) x = PANEL_W - 1;
  if (y >= PANEL_H) y = PANEL_H - 1;
  schedule_fn(t, finger, NULL, (down ? 1 << 30 : 0) | y << 15 | x);
}

int board_command(const char *cmd, char *rest, int lineno) {
  vtime_t t = K.vnow;
  if (!strcmp(cmd, "tap") || !strcmp(cmd, "hold")) {
    int x, y, ms = 80;
    if (sscanf(rest, "%d %d %d", &x, &y, &ms) < 2) { fprintf(stderr, "line %d: %s X Y%s\n", lineno, cmd, cmd[0] == 'h' ? " MS" : ""); return -1; }
    at(t, true, x, y);
    at(t + MS(ms), false, x, y);
    kernel_run_until(t + MS(ms) + MS(40));
  } else if (!strcmp(cmd, "swipe") || !strcmp(cmd, "drag")) {
    int x0, y0, x1, y1, ms = 250;
    if (sscanf(rest, "%d %d %d %d %d", &x0, &y0, &x1, &y1, &ms) < 4) { fprintf(stderr, "line %d: %s X0 Y0 X1 Y1 [MS]\n", lineno, cmd); return -1; }
    int steps = ms / 10 > 1 ? ms / 10 : 1;
    for (int i = 0; i <= steps; i++) at(t + MS(10) * i, true, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
    at(t + MS(10) * steps + MS(10), false, x1, y1);
    kernel_run_until(t + MS(10) * steps + MS(60));
  } else if (!strcmp(cmd, "battery")) {
    B.pct = atoi(rest);
    B.charging = strstr(rest, "charging") != NULL;
  } else return 0;
  return 1;
}

int board_capture(const char *path, int scale, const char *opts) { return epd_capture_png(path, scale, !strstr(opts, "clean")); }
void board_report(void) { epd_report(); printf("touch: %d reports made\n", gt911_reports()); }
