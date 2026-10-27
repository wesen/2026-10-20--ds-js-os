// The simulated PicoCalc board: the ST7365P panel on SPI2 and the STM32 keyboard/power controller on I2C0,
// and the script commands that work them (key, type, battery, panel).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include "picocalc.h"
#include "../host/board.h"

const char *board_commands_help = "key NAME [HOLD_MS] | type TEXT | battery PCT [charging] | panel";

void board_init(void) { srand(1); st7365p_reset(); stm32_init(); }
const char *const *port_bus_names(void) { static const char *const b[] = { "i2c0", "spi2", NULL }; return b; }
const char *port_board_name(void) { return "ESP32-P4 in a PicoCalc (simulated)"; }
int port_gpio_watch(int pin, int mode, int handle_id) { (void)pin; (void)mode; (void)handle_id; return -1; }   // no pin interrupts here
void port_gpio_arm(int pin, int mode) { (void)pin; (void)mode; }
void port_gpio_unwatch(int pin) { (void)pin; }

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

int board_command(const char *cmd, char *rest, int lineno) {
  if (!strcmp(cmd, "key")) {
    char name[32] = ""; int hold = 60;
    sscanf(rest, "%31s %d", name, &hold);
    int c = key_code(name);
    if (c < 0) { fprintf(stderr, "line %d: no key called %s\n", lineno, name); return -1; }
    press(c, hold);
  } else if (!strcmp(cmd, "type")) {
    for (char *c = rest; *c; c++) { press((unsigned char)*c, 40); kernel_run_until(K.vnow + MS(40)); }
  } else if (!strcmp(cmd, "battery")) {
    int pct = atoi(rest);
    stm32_battery(pct, strstr(rest, "charging") != NULL);
  } else if (!strcmp(cmd, "panel")) st7365p_report();
  else return 0;
  return 1;
}

int board_capture(const char *path, int scale, const char *opts) { (void)opts; return st7365p_capture_png(path, scale); }
void board_report(void) { st7365p_report(); }
