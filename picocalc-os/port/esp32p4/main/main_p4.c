// picocalc-os on the ESP32-P4: the kernel task, which runs the nucleus on the real clock, and a console on the
// UART (the board's CH343 bridge) for operating the device without looking at it.
//
// The kernel task is the only task that touches K. The bus workers (bus_p4.c) and the console reader hand it
// work through one queue, p4_kq; between batches it runs kernel_run_until(now) and then sleeps until the next
// event is due or something arrives on the queue.
//
// Console commands (one per line):
//   stats | worlds | handles | heap     what the kernel and the allocator report
//   key NAME [HOLD_MS]                  a key press as the keyboard driver would publish it (enter, esc, up, f1, a, ...)
//   type TEXT                           a press per character, 90 ms apart
//   crash WORLD | restart WORLD         kill a world as a fault would / restart it as sys.admin would
//   shot                                the compositor's framebuffer: "#SHOT w h", base64 run-length lines, "#END crc"
//   bench                               the calibration loops again, on the real clock
//   trace on|off                        log every message
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "driver/uart.h"
#include "driver/uart_vfs.h"
#include "esp_chip_info.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_psram.h"
#include "freertos/task.h"
#include "p4.h"

static const char *TAG = "picocalc-os";
void vm_calibrate(void);

// ---- keys, as js/drivers/keyboard.js publishes them -------------------------------------------------------------
static const struct { const char *name; int code; } KEYS[] = {
  { "enter", 0x0A }, { "backspace", 0x08 }, { "tab", 0x09 }, { "esc", 0xB1 },
  { "left", 0xB4 }, { "up", 0xB5 }, { "down", 0xB6 }, { "right", 0xB7 }, { "space", 0x20 },
  { "f1", 0x81 }, { "f2", 0x82 }, { "f3", 0x83 }, { "f4", 0x84 }, { "f5", 0x85 }, { "f6", 0x86 }, { "f7", 0x87 },
  { "f8", 0x88 }, { "f9", 0x89 }, { "f10", 0x90 }, { "power", 0x91 }, { "break", 0xD0 }, { "insert", 0xD1 },
  { "home", 0xD2 }, { "del", 0xD4 }, { "end", 0xD5 }, { "pgup", 0xD6 }, { "pgdn", 0xD7 },
  { "return", 0x0A }, { "bs", 0x08 },
};
static int key_code(const char *n) {
  for (size_t i = 0; i < sizeof KEYS / sizeof KEYS[0]; i++) if (!strcasecmp(n, KEYS[i].name)) return KEYS[i].code;
  if (strlen(n) == 1) return (unsigned char)n[0];
  if (!strncmp(n, "0x", 2)) return (int)strtol(n, NULL, 16);
  return -1;
}
static const char *key_name(int code) {
  for (size_t i = 0; i < sizeof KEYS / sizeof KEYS[0]; i++) if (KEYS[i].code == code) return KEYS[i].name;
  return NULL;
}

// a = code | state << 8, state 1 down, 2 hold, 3 up
static void key_event(void *arg, int a) {
  static const char *STATES[] = { "", "down", "hold", "up" };
  int code = a & 0xff, state = a >> 8;
  char ch[2] = { 0 }, key[16];
  if (code >= 0x20 && code < 0x7f) ch[0] = (char)code;
  const char *n = key_name(code);
  if (n && code != ' ' ) snprintf(key, sizeof key, "%s", n);
  else if (ch[0] && code != ' ') snprintf(key, sizeof key, "%s", ch);
  else if (code == ' ') snprintf(key, sizeof key, "space");
  else snprintf(key, sizeof key, "0x%x", code);
  sbuf_t b = { 0 };
  sb_printf(&b, "{\"code\":%d,\"key\":", code); sb_json_str(&b, key);
  sb_add(&b, ",\"ch\":"); sb_json_str(&b, ch);
  sb_printf(&b, ",\"state\":\"%s\",\"caps\":false,\"injected\":true}", STATES[state & 3]);
  kernel_publish(NULL, "keys", b.s, NULL, 0);
  free(b.s);
}
static void press(vtime_t at, int code, int hold_ms) {
  schedule_fn(at, key_event, NULL, code | 1 << 8);
  if (hold_ms >= 300) schedule_fn(at + MS(300), key_event, NULL, code | 2 << 8);
  schedule_fn(at + MS(hold_ms), key_event, NULL, code | 3 << 8);
}

// ---- shot: the framebuffer, run-length encoded, in base64 ---------------------------------------------------------
static uint32_t crc32(uint32_t c, const uint8_t *p, size_t n) {
  c = ~c;
  while (n--) { c ^= *p++; for (int k = 0; k < 8; k++) c = c & 1 ? (c >> 1) ^ 0xEDB88320u : c >> 1; }
  return ~c;
}
static void b64_line(const uint8_t *p, int n) {
  static const char A[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  char out[128]; int k = 0;
  for (int i = 0; i < n; i += 3) {
    uint32_t v = p[i] << 16 | (i + 1 < n ? p[i + 1] << 8 : 0) | (i + 2 < n ? p[i + 2] : 0);
    out[k++] = A[v >> 18 & 63]; out[k++] = A[v >> 12 & 63];
    out[k++] = i + 1 < n ? A[v >> 6 & 63] : '='; out[k++] = i + 2 < n ? A[v & 63] : '=';
  }
  out[k] = 0;
  printf("%s\n", out);
}
// The kernel task only copies the framebuffer (a millisecond); this task encodes and prints it, which takes
// seconds at 115200 baud and would otherwise stop every world, the keyboard's polling included.
static struct { uint16_t *px; int w, h; volatile bool busy; TaskHandle_t task; } snap;

static void shot_task(void *arg) {
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    const uint16_t *px = snap.px;
    size_t n = (size_t)snap.w * snap.h;
    printf("#SHOT %d %d\n", snap.w, snap.h);
    uint8_t line[57]; int ln = 0;   // 57 bytes = 76 base64 characters
    size_t runs = 0;
    for (size_t i = 0; i < n;) {
      uint16_t v = px[i];
      size_t j = i + 1;
      while (j < n && px[j] == v && j - i < 65535) j++;
      uint16_t c = (uint16_t)(j - i);
      uint8_t rec[4] = { (uint8_t)c, (uint8_t)(c >> 8), (uint8_t)v, (uint8_t)(v >> 8) };
      for (int k = 0; k < 4; k++) { line[ln++] = rec[k]; if (ln == 57) { b64_line(line, ln); ln = 0; } }
      runs++; i = j;
    }
    if (ln) b64_line(line, ln);
    printf("#END %08lx %u\n", (unsigned long)crc32(0, (const uint8_t *)px, n * 2), (unsigned)runs);
    fflush(stdout);
    snap.busy = false;
  }
}

static void shot(void) {
  dmabuf_t *b = NULL;
  for (int i = 0; i < MAX_BUFS; i++) if (K.bufs[i].live) { b = &K.bufs[i]; break; }
  if (!b) { printf("#SHOT none\n"); return; }
  if (snap.busy) { printf("a shot is still being sent\n"); return; }
  size_t bytes = (size_t)b->w * b->h * 2;
  if (!snap.px || (size_t)snap.w * snap.h * 2 < bytes) { heap_caps_free(snap.px); snap.px = heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM); }
  if (!snap.px) { printf("no memory for a shot\n"); return; }
  memcpy(snap.px, b->front, bytes);
  snap.w = b->w; snap.h = b->h; snap.busy = true;
  xTaskNotifyGive(snap.task);
}

static void heap_report(void) {
  printf("heap: internal %u free (largest %u), psram %u free (largest %u)\n",
         (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL), (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL),
         (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM), (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM));
}

void console_exec(char *line) {
  char *p = line;
  while (isspace((unsigned char)*p)) p++;
  char *e = p + strlen(p);
  while (e > p && isspace((unsigned char)e[-1])) *--e = 0;
  if (!*p) return;
  char cmd[32] = ""; int n = 0;
  sscanf(p, "%31s%n", cmd, &n);
  char *rest = p + n;
  while (isspace((unsigned char)*rest)) rest++;
  vtime_t now = port_clock();
  if (!strcmp(cmd, "stats")) kernel_stats_print();
  else if (!strcmp(cmd, "worlds") || !strcmp(cmd, "handles")) {
    char *j = !strcmp(cmd, "worlds") ? kernel_worlds_json() : hw_handles_json();
    printf("%s\n", j); free(j);
  } else if (!strcmp(cmd, "heap")) heap_report();
  else if (!strcmp(cmd, "key")) {
    char name[32] = ""; int hold = 60;
    sscanf(rest, "%31s %d", name, &hold);
    int c = key_code(name);
    if (c < 0) printf("no key called %s\n", name); else press(now, c, hold);
  } else if (!strcmp(cmd, "type")) {
    int i = 0;
    for (char *c = rest; *c; c++, i++) press(now + MS(90) * i, (unsigned char)*c, 40);
  } else if (!strcmp(cmd, "crash") || !strcmp(cmd, "restart")) {
    world_t *W = world_by_name(rest);
    if (!W) printf("no world called %s\n", rest);
    else if (cmd[0] == 'c') kernel_fault(W, "killed from the console");
    else kernel_restart_world(W);
  } else if (!strcmp(cmd, "shot")) shot();
  else if (!strcmp(cmd, "bench")) vm_calibrate();
  else if (!strcmp(cmd, "trace")) K.trace = !strcmp(rest, "on");
  else if (!strcmp(cmd, "help")) printf("stats worlds handles heap | key NAME [MS] | type TEXT | crash W | restart W | shot | bench | trace on|off\n");
  else printf("unknown command %s (try help)\n", cmd);
  printf("#OK %s\n", cmd);
  fflush(stdout);
}

// ---- tasks ----------------------------------------------------------------------------------------------------------
static void console_task(void *arg) {
  char line[256]; int n = 0;
  for (;;) {
    uint8_t c;
    if (uart_read_bytes(UART_NUM_0, &c, 1, portMAX_DELAY) != 1) continue;
    if (c == '\r' || c == '\n') {
      if (!n) continue;
      line[n] = 0; n = 0;
      kmsg_t m = { .line = strdup(line) };
      xQueueSend(p4_kq, &m, portMAX_DELAY);
    } else if (n < (int)sizeof line - 1) line[n++] = (char)c;
  }
}

static void kernel_task(void *arg) {
  K.realtime = true;
  K.uart = stdout;            // the kernel log and the #OCT1 fault frames go to the console
  port_clock();               // starts the clock
  kernel_init("js", NULL);    // the prelude, and the calibration loops
  if (kernel_boot("js/system.json")) { ESP_LOGE(TAG, "the manifest did not load"); vTaskDelete(NULL); }
  for (;;) {
    kmsg_t m;
    while (xQueueReceive(p4_kq, &m, 0) == pdTRUE) {
      if (m.line) { console_exec(m.line); free(m.line); }
      else bus_p4_done(&m);
    }
    kernel_run_until(port_clock());
    vtime_t wait = kernel_next_wake() - port_clock();
    if (wait <= 0) continue;
    if (wait > MS(50)) wait = MS(50);
    if (xQueueReceive(p4_kq, &m, pdMS_TO_TICKS((wait + 999) / 1000)) == pdTRUE) {
      if (m.line) { console_exec(m.line); free(m.line); }
      else bus_p4_done(&m);
    }
  }
}

void app_main(void) {
  esp_chip_info_t chip;
  esp_chip_info(&chip);
  ESP_LOGI(TAG, "picocalc-os on %s rev %d.%d, %d cores, %u KB PSRAM", CONFIG_IDF_TARGET, chip.revision / 100, chip.revision % 100,
           chip.cores, (unsigned)(esp_psram_get_size() / 1024));
  heap_report();

  // the console: a UART driver, so input can be read and output does not block on the ROM routines
  ESP_ERROR_CHECK(uart_driver_install(UART_NUM_0, 1024, 4096, 0, NULL, 0));
  uart_vfs_dev_use_driver(UART_NUM_0);
  setvbuf(stdout, NULL, _IOLBF, 0);

  bus_p4_init();
  xTaskCreatePinnedToCore(console_task, "console", 4096, NULL, 3, NULL, 0);
  xTaskCreatePinnedToCore(shot_task, "shot", 4096, NULL, 2, &snap.task, 0);
  // QuickJS recurses on the C stack: the kernel task gets 80 KB of internal RAM (port_js_stack is 56 KB of it)
  xTaskCreatePinnedToCore(kernel_task, "kernel", 80 * 1024, NULL, 5, NULL, 1);
}
