// picocalc-os on the M5Stack PaperS3: the kernel task, which runs the nucleus on the real clock, and a console on
// the native USB Serial/JTAG for operating the device without looking at it.
//
// The kernel task is the only task that touches K. The bus workers (bus_s3.cpp) and the console reader hand it
// work through one queue, s3_kq; between batches it runs kernel_run_until(now) and then sleeps until the next
// event is due or something arrives on the queue.
//
// Console commands (one per line):
//   stats | worlds | handles | heap     what the kernel and the allocator report
//   tap X Y | hold X Y MS               a finger on the screen, as the touch driver would publish it
//   swipe X0 Y0 X1 Y1 [MS]              a finger moved across the screen
//   send WORLD TYPE [JSON]              a message to a world (e.g. send repl type {"text":"1+2"})
//   clean                               a clean full refresh of the panel
//   crash WORLD | restart WORLD         kill a world as a fault would / restart it as sys.admin would
//   shot                                the compositor's framebuffer: "#SHOT w h g8", base64 run-length lines, "#END crc"
//   bench                               the calibration loops again, on the real clock
//   trace on|off                        log every message
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "driver/uart.h"
#include "driver/uart_vfs.h"
#include "driver/usb_serial_jtag.h"
#include "esp_chip_info.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_pm.h"
#include "esp_timer.h"
#include "esp_system.h"
#include "driver/gpio.h"
#include "esp_psram.h"
#include "driver/usb_serial_jtag_vfs.h"
#include "freertos/task.h"
#include "s3.h"

static const char *TAG = "picocalc-os";

// ---- touches, as js-papers3/drivers/touch.js publishes them ----------------------------------------------------
// a = x | y << 12 | phase << 24 (0 down, 1 move, 2 up)
static void touch_event(void *arg, int a) {
  static const char *PHASES[] = { "down", "move", "up" };
  char j[128];
  snprintf(j, sizeof j, "{\"id\":0,\"x\":%d,\"y\":%d,\"phase\":\"%s\",\"t\":%.3f,\"injected\":true}", a & 0xfff, a >> 12 & 0xfff, PHASES[a >> 24 & 3], kernel_now() / 1000.0);
  kernel_publish(NULL, "touch", j, NULL, 0);
}
static void finger(vtime_t at, int phase, int x, int y) {
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > 539) x = 539;
  if (y > 959) y = 959;
  schedule_fn(at, touch_event, NULL, x | y << 12 | phase << 24);
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
// The kernel task only copies the framebuffer; this task encodes and prints it, which takes a while over USB
// and would otherwise stop every world.
static struct { uint8_t *px; int w, h; volatile bool busy; TaskHandle_t task; } snap;

static void shot_task(void *arg) {
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    size_t n = (size_t)snap.w * snap.h;
    printf("#SHOT %d %d g8\n", snap.w, snap.h);
    uint8_t line[57]; int ln = 0;   // 57 bytes = 76 base64 characters
    size_t runs = 0;
    for (size_t i = 0; i < n;) {   // records of (count low, count high, gray)
      uint8_t v = snap.px[i];
      size_t j = i + 1;
      while (j < n && snap.px[j] == v && j - i < 65535) j++;
      uint16_t c = (uint16_t)(j - i);
      uint8_t rec[3] = { (uint8_t)c, (uint8_t)(c >> 8), v };
      for (int k = 0; k < 3; k++) { line[ln++] = rec[k]; if (ln == 57) { b64_line(line, ln); ln = 0; } }
      runs++; i = j;
    }
    if (ln) b64_line(line, ln);
    printf("#END %08lx %u\n", (unsigned long)crc32(0, snap.px, n), (unsigned)runs);
    fflush(stdout);
    snap.busy = false;
  }
}

static void shot(void) {
  dmabuf_t *b = NULL;
  for (int i = 0; i < MAX_BUFS; i++) if (K.bufs[i].live) { b = &K.bufs[i]; break; }
  if (!b) { printf("#SHOT none\n"); return; }
  if (snap.busy) { printf("a shot is still being sent\n"); return; }
  size_t bytes = (size_t)b->w * b->h;
  if (!snap.px || (size_t)snap.w * snap.h < bytes) { heap_caps_free(snap.px); snap.px = heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM); }
  if (!snap.px) { printf("no memory for a shot\n"); return; }
  memcpy(snap.px, b->front, bytes);
  snap.w = b->w; snap.h = b->h; snap.busy = true;
  xTaskNotifyGive(snap.task);
}

static TaskHandle_t kernel_th;

static void heap_report(void) {
  if (!heap_caps_check_integrity_all(true)) { printf("heap: CORRUPT (see above); not walking it\n"); return; }
  printf("heap: internal %u free (largest %u), psram %u free (largest %u)",
         (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL), (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL),
         (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM), (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM));
  if (kernel_th) printf("; the kernel task's stack has %u bytes never used", (unsigned)uxTaskGetStackHighWaterMark(kernel_th));
  printf("\n");
}

// ---- prof: where the time goes over a window, from boot or from the last "prof reset" ----------------------------
static struct { vtime_t t0, blocked_us; uint64_t wakeups; vtime_t cpu0[MAX_WORLDS]; unsigned gcs0[MAX_WORLDS]; } prof;

static void prof_reset(void) {
  prof.t0 = port_clock(); prof.blocked_us = 0; prof.wakeups = 0;
  for (int i = 0; i < K.n_worlds; i++) {
    world_t *W = K.worlds[i];
    W->prof_engine_us = W->prof_render_us = 0; W->prof_segments = W->prof_steps = 0;
    prof.cpu0[i] = W->cpu_us; prof.gcs0[i] = W->gcs;
  }
  vm_op_prof_reset();
}

static void prof_print(void) {
  double secs = (port_clock() - prof.t0) / 1e6, lane = 0;
  for (int i = 0; i < K.n_worlds; i++) lane += K.worlds[i]->cpu_us - prof.cpu0[i];
  printf("prof over %.1f s: the kernel task woke %llu times (%.1f/s) and was blocked %.0f%% of the time; worlds ran %.0f ms (%.1f%%)\n",
         secs, (unsigned long long)prof.wakeups, prof.wakeups / secs, prof.blocked_us / 1e4 / secs, lane / 1000.0, lane / 1e4 / secs);
  printf("  world        segs  segs/s    cpu ms  engine ms  render ms  other ms  ms/seg  steps/seg  gcs\n");
  for (int i = 0; i < K.n_worlds; i++) {
    world_t *W = K.worlds[i];
    if (!W->prof_segments) continue;
    double cpu = (W->cpu_us - prof.cpu0[i]) / 1000.0, eng = W->prof_engine_us / 1000.0, ren = W->prof_render_us / 1000.0;
    printf("  %-11s %5llu %7.1f %9.1f %10.1f %10.1f %9.1f %7.2f %10.0f %4d\n", W->name, (unsigned long long)W->prof_segments, W->prof_segments / secs,
           cpu, eng, ren, cpu - eng - ren, cpu / W->prof_segments, (double)W->prof_steps / W->prof_segments, (int)(W->gcs - prof.gcs0[i]));
  }
  // host operations, most time first (inside "engine ms" above; the rest of engine time is the interpreter and GC)
  const op_prof_t *ops;
  int n = vm_op_prof(&ops), order[96], m = 0;
  for (int i = 0; i < n && m < 96; i++) if (ops[i].n) order[m++] = i;
  for (int i = 1; i < m; i++) for (int j = i; j > 0 && ops[order[j]].us > ops[order[j - 1]].us; j--) { int x = order[j]; order[j] = order[j - 1]; order[j - 1] = x; }
  printf("  host op          calls   total ms   us/call\n");
  for (int i = 0; i < m; i++)
    printf("  %-15s %6lu %10.1f %9.1f\n", ops[order[i]].name, (unsigned long)ops[order[i]].n, ops[order[i]].us / 1000.0, (double)ops[order[i]].us / ops[order[i]].n);
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
  else if (!strcmp(cmd, "boot")) {
    static const char *WHY[] = { "unknown", "power-on", "external pin", "software", "panic", "interrupt watchdog",
                                 "task watchdog", "other watchdog", "deep sleep", "brownout", "SDIO", "USB", "JTAG", "efuse",
                                 "power glitch", "CPU lockup" };
    esp_reset_reason_t r = esp_reset_reason();
    printf("up %.1f s; the last reset: %s (%d)\n", esp_timer_get_time() / 1e6, r < sizeof WHY / sizeof *WHY ? WHY[r] : "?", r);
  }
  else if (!strcmp(cmd, "reboot")) { fflush(stdout); esp_restart(); }
  else if (!strcmp(cmd, "store")) {   // store WORLD: the world's persistent record
    size_t len = 0;
    char *r = port_store_get("w", rest, &len);
    printf("store %s: %s (%u bytes)\n", rest, r ? r : "none", (unsigned)len);
    free(r);
  }
  else if (!strcmp(cmd, "gpio")) { int pin = atoi(rest); printf("gpio %d: %d\n", pin, gpio_get_level(pin)); }
  else if (!strcmp(cmd, "prof")) { if (!strcmp(rest, "reset")) prof_reset(); else prof_print(); }
#if CONFIG_PM_ENABLE
  else if (!strcmp(cmd, "pm")) esp_pm_dump_locks(stdout);   // the locks, and (CONFIG_PM_PROFILING) time in each mode
#endif
  else if (!strcmp(cmd, "tap") || !strcmp(cmd, "hold")) {
    int x = 0, y = 0, ms = 80;
    sscanf(rest, "%d %d %d", &x, &y, &ms);
    finger(now, 0, x, y);
    finger(now + MS(ms), 2, x, y);
  } else if (!strcmp(cmd, "swipe")) {
    int x0, y0, x1, y1, ms = 250;
    if (sscanf(rest, "%d %d %d %d %d", &x0, &y0, &x1, &y1, &ms) >= 4) {
      int steps = ms / 20 > 1 ? ms / 20 : 1;
      finger(now, 0, x0, y0);
      for (int i = 1; i <= steps; i++) finger(now + MS(20) * i, 1, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
      finger(now + MS(20) * steps + MS(20), 2, x1, y1);
    } else printf("swipe X0 Y0 X1 Y1 [MS]\n");
  } else if (!strcmp(cmd, "send")) {
    char to[NAME_LEN] = "", type[NAME_LEN] = ""; int m = 0;
    sscanf(rest, "%31s %31s %n", to, type, &m);
    world_t *W = world_by_name(to);
    if (!W || !type[0]) printf("send WORLD TYPE [JSON]\n");
    else defer_deliver(W, new_msg(M_ON, type, m && rest[m] ? rest + m : NULL, -1));
  } else if (!strcmp(cmd, "clean")) {
    world_t *W = world_by_name("compositor");
    if (W) defer_deliver(W, new_msg(M_ON, "clean", NULL, -1));
  } else if (!strcmp(cmd, "crash") || !strcmp(cmd, "restart")) {
    world_t *W = world_by_name(rest);
    if (!W) printf("no world called %s\n", rest);
    else if (cmd[0] == 'c') kernel_fault(W, "killed from the console");
    else kernel_restart_world(W);
  } else if (!strcmp(cmd, "shot")) shot();
  else if (!strcmp(cmd, "bench")) vm_calibrate();
  else if (!strcmp(cmd, "trace")) K.trace = !strcmp(rest, "on");
  else if (!strcmp(cmd, "help")) printf("stats worlds handles heap prof [reset] pm gpio N boot reboot store W | tap X Y | hold X Y MS | swipe X0 Y0 X1 Y1 [MS] | send W T [JSON] | clean | crash W | restart W | shot | bench | trace on|off\n");
  else printf("unknown command %s (try help)\n", cmd);
  printf("#OK %s\n", cmd);
  fflush(stdout);
}

// ---- tasks ----------------------------------------------------------------------------------------------------------
#ifdef S3_QEMU
#define MANIFEST "js/test/qemu.json"   // the engine's conformance worlds in smaller arenas: the system does not fit without PSRAM
#else
#define MANIFEST "js/system.json"
#endif

// The console is the native USB Serial/JTAG; under QEMU, which has none, it is UART0.
static void console_init(void) {
#ifdef S3_QEMU
  ESP_ERROR_CHECK(uart_driver_install(UART_NUM_0, 1024, 4096, 0, NULL, 0));
  uart_vfs_dev_use_driver(UART_NUM_0);
#else
  usb_serial_jtag_driver_config_t uc = { .tx_buffer_size = 4096, .rx_buffer_size = 1024 };
  ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&uc));
  usb_serial_jtag_vfs_use_driver();
#endif
}

static int console_getc(uint8_t *c) {
#ifdef S3_QEMU
  return uart_read_bytes(UART_NUM_0, c, 1, portMAX_DELAY);
#else
  return usb_serial_jtag_read_bytes(c, 1, portMAX_DELAY);
#endif
}

static void console_task(void *arg) {
  char line[256]; int n = 0;
  for (;;) {
    uint8_t c;
    if (console_getc(&c) != 1) continue;
    if (c == '\r' || c == '\n') {
      if (!n) continue;
      line[n] = 0; n = 0;
      kmsg_t m = { .line = strdup(line) };
      xQueueSend(s3_kq, &m, portMAX_DELAY);
    } else if (n < (int)sizeof line - 1) line[n++] = (char)c;
  }
}

static void kmsg_handle(kmsg_t *m) {
  if (m->line) { console_exec(m->line); free(m->line); }
  else if (m->irq) kernel_irq(m->irq, port_clock());
  else bus_s3_done(m);
}

static void kernel_task(void *arg) {
  K.realtime = true;
#ifdef S3_QEMU
  K.trace = true;
#endif
  K.uart = stdout;            // the kernel log and the #OCT1 fault frames go to the console
  port_clock();               // starts the clock
  kernel_init("js", NULL);    // the prelude, and the calibration loops
  if (kernel_boot(MANIFEST)) { ESP_LOGE(TAG, "the manifest did not load"); vTaskDelete(NULL); }
  for (;;) {
    kmsg_t m;
    s3_pm_hold(PM_KERNEL);   // worlds run at full speed; between wakes nothing is held and the chip may sleep
    while (xQueueReceive(s3_kq, &m, 0) == pdTRUE) kmsg_handle(&m);
    kernel_run_until(port_clock());
#ifdef S3_QEMU   // a fault-finding run: stop at the first step after which the heap is damaged (K.trace names the turns)
    if (!heap_caps_check_integrity_all(true)) { printf("heap damaged at %.3f ms; the trace above shows the turns that ran\n", port_clock() / 1000.0); abort(); }
#endif
    // block until the next thing is due, or until another task (a bus worker, the console) posts to s3_kq
    vtime_t next = kernel_next_wake(), wait = next == VT_INF ? 0 : next - port_clock();
    if (next != VT_INF && wait <= 0) { s3_pm_release(PM_KERNEL); continue; }
    s3_pm_release(PM_KERNEL);
    vtime_t t_block = port_clock();
    BaseType_t got = xQueueReceive(s3_kq, &m, next == VT_INF ? portMAX_DELAY : pdMS_TO_TICKS((wait + 999) / 1000));
    prof.blocked_us += port_clock() - t_block; prof.wakeups++;
    if (got == pdTRUE) kmsg_handle(&m);
  }
}

void app_main(void) {
  esp_chip_info_t chip;
  esp_chip_info(&chip);
#if CONFIG_SPIRAM
  unsigned psram_kb = (unsigned)(esp_psram_get_size() / 1024);
#else
  unsigned psram_kb = 0;
#endif
  ESP_LOGI(TAG, "picocalc-os on %s rev %d.%d, %d cores, %u KB PSRAM", CONFIG_IDF_TARGET, chip.revision / 100, chip.revision % 100,
           chip.cores, psram_kb);
  heap_report();

  // the console's driver, so input can be read and output does not spin on the ROM routines
  console_init();
  setvbuf(stdout, NULL, _IOLBF, 0);

  port_s3_init();
  s3_pm_init();   // after port_s3_init, which configures the charger pin it watches
  s3_store_init();
  bus_s3_init();
  xTaskCreatePinnedToCore(console_task, "console", 4096, NULL, 3, NULL, 0);
  xTaskCreatePinnedToCore(shot_task, "shot", 4096, NULL, 2, &snap.task, 0);
  // MicroQuickJS keeps its stacks in the arenas; the kernel task's own stack is for C (JSON, the gfx calls)
#ifdef S3_QEMU
  xTaskCreatePinnedToCore(kernel_task, "kernel", 12 * 1024, NULL, 5, &kernel_th, 1);   // the test worlds use under 5 KB of it
#else
  xTaskCreatePinnedToCore(kernel_task, "kernel", 32 * 1024, NULL, 5, &kernel_th, 1);
#endif
}
