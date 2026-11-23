// The compiled-module cache on the P4 (PICOCALC-COMPILE-CACHE): typed_p4.c asks it for a module before compiling and
// hands it every module it compiles. typed_cache.c is the portable core; this file adds what only the device has:
//
// - The key's inputs. Each bundle is hashed once per boot (mbedTLS, the P4's SHA accelerator) and its digest kept.
//   Every bundle under typed/ enters the key, because typedRv32Load can evaluate any of them, whatever the policy.
//   TYPED_NATIVE_SHA (CMake, at configure time) covers the compiler's C side: typed_lex_index, typed_p4.c, QuickJS.
// - The stacks. A FAT call ends in a flash operation that disables the caches, which ESP-IDF allows only from a task
//   whose stack is in internal RAM. The kernel task's is; the painter's build worker and the gallery's compile task
//   have PSRAM stacks. A read from such a task runs on a helper task with an internal stack, at the caller's priority.
// - The writes. A compile's module goes to a writer task (core 1, priority 1: below the kernel and the painter's
//   build worker), so a cold boot does not wait for flash writes. "hold" stops it between entries.
// - One lock around every file operation on the cache except the .tmp write: FATFS here cannot delete an open file
//   safely (CONFIG_FATFS_FS_LOCK=0).
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "esp_memory_utils.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "p4.h"
#include "typed_cache.h"

#define DIR "/files/.cache/typed"
static const tc_policy POLICY = {.per_label = 2, .budget = 4u << 20, .reserve = 1u << 20};
static const char NATIVE[] = "c " TYPED_NATIVE_SHA " quickjs " CONFIG_VERSION;

struct js_file { const char *path; const unsigned char *data; size_t len; };
extern const struct js_file js_bundle[];

static SemaphoreHandle_t lock, memo_lock;
static portMUX_TYPE init_mux = portMUX_INITIALIZER_UNLOCKED;
static void init_locks(void) {
  taskENTER_CRITICAL(&init_mux);
  if (!lock) { lock = xSemaphoreCreateMutex(); memo_lock = xSemaphoreCreateMutex(); }
  taskEXIT_CRITICAL(&init_mux);
}
static int64_t now(void) { return esp_timer_get_time(); }

static void hex16(const uint8_t sha[32], char out[17]) { for (int i = 0; i < 8; i++) snprintf(out + 2 * i, 3, "%02x", sha[i]); }

// ---- the key ----
static uint8_t (*digests)[32];
static uint8_t *known;
static size_t n_bundle;

static const struct js_file *find(const char *path) {
  for (const struct js_file *f = js_bundle; f->path; f++) if (!strcmp(f->path, path)) return f;
  return NULL;
}

static const uint8_t *digest(const struct js_file *f) {
  if (!f) return NULL;
  xSemaphoreTake(memo_lock, portMAX_DELAY);
  if (!digests) {
    while (js_bundle[n_bundle].path) n_bundle++;
    digests = calloc(n_bundle, 32);
    known = calloc(n_bundle, 1);
  }
  const size_t i = (size_t)(f - js_bundle);
  const uint8_t *d = NULL;
  if (digests && known) {
    if (!known[i]) { tc_sha256(f->data, f->len, digests[i]); known[i] = 1; }
    d = digests[i];
  }
  xSemaphoreGive(memo_lock);
  return d;
}

static int by_path(const void *a, const void *b) { return strcmp(((const tc_bundle *)a)->path, ((const tc_bundle *)b)->path); }

bool p4_typed_cache_key(const p4_typed_app *app, const char *bundled, const char *text, size_t text_length,
                        const p4_compile_limits *limits, uint8_t key[32]) {
  if (!port_fs_root()) return false;
  init_locks();
  tc_bundle bundles[24];
  size_t n = 0;
  for (const struct js_file *f = js_bundle; f->path; f++) {
    if (strncmp(f->path, "typed/", 6)) continue;
    if (n == sizeof bundles / sizeof *bundles || !(bundles[n].digest = digest(f))) return false;
    bundles[n++].path = f->path;
  }
  qsort(bundles, n, sizeof *bundles, by_path);
  const char *backend = limits->rv32_backend ? limits->rv32_backend : "typed/rv32.js";
  uint8_t source[32];
  const uint8_t *src = text ? (tc_sha256(text, text_length, source), source) : digest(find(bundled));
  tc_inputs in = {.native = NATIVE, .bundles = bundles, .n_bundles = n, .modules = app->compiler, .backend = backend,
                  .backend_digest = strncmp(backend, "typed/", 6) ? digest(find(backend)) : NULL,
                  .linker = digest(find(app->link)), .entry = app->entry, .reactor = digest(find(app->reactor)),
                  .source = src, .policy = limits->policy};
  if (!in.linker || !in.reactor || !in.source || (strncmp(backend, "typed/", 6) && !in.backend_digest)) return false;
  tc_key(&in, key);
  return true;
}

// ---- reads ----
typedef struct { const uint8_t *key; char *module; tc_header h; tc_result r; char why[120]; TaskHandle_t waiter; } read_job;
static void do_read(read_job *j) {
  xSemaphoreTake(lock, portMAX_DELAY);
  j->r = tc_read(DIR, j->key, &j->module, &j->h, j->why, sizeof j->why);
  xSemaphoreGive(lock);
}
static void read_task(void *arg) {
  read_job *j = arg;
  do_read(j);
  xTaskNotifyGive(j->waiter);
  vTaskSuspend(NULL);   // the caller deletes this task
}
// Runs fn(arg) on a task with an internal stack, unless the caller's stack is internal already.
static bool on_internal_stack(TaskFunction_t task, void (*direct)(read_job *), read_job *j) {
  if (esp_ptr_internal(&j)) { direct(j); return true; }
  j->waiter = xTaskGetCurrentTaskHandle();
  TaskHandle_t h = NULL;
  if (xTaskCreatePinnedToCoreWithCaps(task, "tcache-io", 6 * 1024, j, uxTaskPriorityGet(NULL), &h, xPortGetCoreID(),
                                      MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) != pdPASS)
    return false;
  ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
  vTaskDeleteWithCaps(h);
  return true;
}

char *p4_typed_cache_read(const char *name, const uint8_t key[32], size_t *length, int64_t key_us) {
  read_job j = {.key = key};
  const int64_t t0 = now();
  if (!on_internal_stack(read_task, do_read, &j)) {
    printf("%s cache miss key_us=%" PRId64 " (no internal stack for the read)\n", name, key_us);
    return NULL;
  }
  const int64_t read_us = now() - t0;
  char sha[17];
  if (j.r == TC_HIT) {
    hex16(j.h.sha, sha);
    *length = j.h.length;
    printf("%s cache hit us=%" PRId64 " key_us=%" PRId64 " read_us=%" PRId64 " module_bytes=%" PRIu32
           " sha=%s seq=%" PRIu32 " saved_us=%" PRIu32 "\n", name, key_us + read_us, key_us, read_us, j.h.length, sha,
           j.h.seq, j.h.compile_us);
    return j.module;
  }
  printf("%s cache %s key_us=%" PRId64 " read_us=%" PRId64 "%s%s\n", name,
         j.r == TC_CORRUPT ? "corrupt" : j.r == TC_NO_MEMORY ? "unread (no memory)" : "miss", key_us, read_us,
         j.why[0] ? ": " : "", j.why);
  return NULL;
}

// ---- writes ----
typedef struct { tc_header h; char *module; } write_job;
static QueueHandle_t writes;
static volatile bool held, writing;

static void writer(void *arg) {
  for (;;) {
    write_job *j;
    xQueueReceive(writes, &j, portMAX_DELAY);
    while (held) vTaskDelay(pdMS_TO_TICKS(200));   // a reboot or a flash follows
    writing = true;
    char why[160] = "";
    uint64_t total = 0, free_bytes = 0;
    port_fs_info(&total, &free_bytes);
    const int64_t t0 = now();
    xSemaphoreTake(lock, portMAX_DELAY);
    const bool exists = tc_exists(DIR, j->h.key);
    bool ok = !exists && tc_prepare(DIR, &j->h, free_bytes, &POLICY, why, sizeof why);
    xSemaphoreGive(lock);
    const int64_t t1 = now();
    if (ok) ok = tc_write_tmp(DIR, &j->h, j->module, why, sizeof why);
    const int64_t t2 = now();
    if (ok) {
      xSemaphoreTake(lock, portMAX_DELAY);
      ok = tc_commit(DIR, j->h.key, why, sizeof why);
      xSemaphoreGive(lock);
    }
    const int64_t t3 = now();
    if (ok)
      printf("%s cache stored seq=%" PRIu32 " module_bytes=%" PRIu32 " us=%" PRId64 " prepare_us=%" PRId64
             " write_us=%" PRId64 " commit_us=%" PRId64 " free_kb=%" PRIu64 "\n", j->h.app, j->h.seq, j->h.length,
             t3 - t0, t1 - t0, t2 - t1, t3 - t2, free_bytes / 1024);
    else
      printf("%s cache not stored: %s\n", j->h.app, exists ? "an entry with this key is there" : why);
    fflush(stdout);
    writing = false;
    free(j->module);
    free(j);
  }
}

void p4_typed_cache_store(const char *name, const char *label, const uint8_t key[32], const char *module,
                          size_t length, int64_t compile_us) {
  if (!port_fs_root() || length > TC_MAX_MODULE) return;
  init_locks();
  taskENTER_CRITICAL(&init_mux);
  static bool starting;
  const bool start = !writes && !starting;
  starting = starting || start;
  taskEXIT_CRITICAL(&init_mux);
  if (start) {
    QueueHandle_t q = xQueueCreate(16, sizeof(write_job *));
    if (q && xTaskCreatePinnedToCoreWithCaps(writer, "tcache-w", 8 * 1024, NULL, 1, NULL, 1,
                                             MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) == pdPASS)
      writes = q;
  }
  write_job *j = writes ? calloc(1, sizeof *j) : NULL;
  char *copy = j ? malloc(length) : NULL;
  if (!copy) {
    free(j);
    printf("%s cache not stored: %s\n", name, writes ? "no memory for the copy" : "no writer");
    return;
  }
  memcpy(copy, module, length);
  memcpy(j->h.key, key, 32);
  j->h.length = (uint32_t)length;
  j->h.compile_us = compile_us > UINT32_MAX ? UINT32_MAX : (uint32_t)compile_us;
  tc_sha256(copy, length, j->h.sha);
  snprintf(j->h.app, sizeof j->h.app, "%s", name);
  snprintf(j->h.label, sizeof j->h.label, "%s", label);
  j->module = copy;
  if (xQueueSend(writes, &j, 0) != pdTRUE) {
    printf("%s cache not stored: the writer's queue is full\n", name);
    free(copy);
    free(j);
  }
}

bool p4_typed_cache_hold(int timeout_ms) {
  held = true;
  for (int t = 0; writing && t < timeout_ms; t += 10) vTaskDelay(pdMS_TO_TICKS(10));
  return !writing;
}

// ---- console: typed cache [clear | corrupt APP flip|cut] ----
typedef struct { unsigned n; uint64_t bytes; const char *app; bool cut; unsigned damaged; } walk;
static bool show(void *arg, const char *file, const tc_header *h, bool valid, long size) {
  walk *w = arg;
  char sha[17] = "";
  if (valid) hex16(h->sha, sha);
  printf("TCACHE {\"file\":\"%s\",\"valid\":%s,\"app\":\"%s\",\"label\":\"%s\",\"seq\":%" PRIu32 ",\"bytes\":%ld,"
         "\"sha\":\"%s\",\"compileUs\":%" PRIu32 "}\n", file, valid ? "true" : "false", valid ? h->app : "",
         valid ? h->label : "", valid ? h->seq : 0, size, sha, valid ? h->compile_us : 0);
  w->n++;
  w->bytes += size > 0 ? (uint64_t)size : 0;
  return true;
}
// For the corrupt-entry gate: flip a byte in the middle of the module, or cut the file short (a torn write).
static bool damage(void *arg, const char *file, const tc_header *h, bool valid, long size) {
  walk *w = arg;
  char path[96];
  if (!valid || strcmp(h->app, w->app) || snprintf(path, sizeof path, DIR "/%s", file) >= (int)sizeof path) return true;
  FILE *f = fopen(path, "r+b");
  if (!f) return true;
  const long at = TC_HEADER + h->length / 2;
  int c = fseek(f, at, SEEK_SET) ? EOF : fgetc(f);
  bool ok = c != EOF && !fseek(f, at, SEEK_SET) && fputc(c ^ 0x20, f) != EOF;
  ok = !fclose(f) && ok;
  if (w->cut) ok = truncate(path, at) == 0;
  if (ok) w->damaged++;
  return true;
}
void p4_typed_cache_console(const char *args) {
  char verb[16] = "", app[32] = "", how[8] = "flip";
  sscanf(args, "%15s %31s %7s", verb, app, how);
  if (!port_fs_root()) { puts("typed cache: no filesystem"); return; }
  init_locks();
  walk w = {.app = app, .cut = !strcmp(how, "cut")};
  xSemaphoreTake(lock, portMAX_DELAY);
  if (!verb[0]) tc_list(DIR, show, &w);
  else if (!strcmp(verb, "clear")) w.n = (unsigned)tc_clear(DIR);
  else if (!strcmp(verb, "corrupt") && app[0]) tc_list(DIR, damage, &w);
  xSemaphoreGive(lock);
  uint64_t total = 0, free_bytes = 0;
  port_fs_info(&total, &free_bytes);
  if (!verb[0])
    printf("TCACHE {\"entries\":%u,\"bytes\":%" PRIu64 ",\"budget\":%" PRIu64 ",\"freeKb\":%" PRIu64 ",\"native\":\"%s\"}\n",
           w.n, w.bytes, POLICY.budget, free_bytes / 1024, NATIVE);
  else if (!strcmp(verb, "clear")) printf("TCACHE {\"cleared\":%u}\n", w.n);
  else if (!strcmp(verb, "corrupt") && app[0]) printf("TCACHE {\"corrupted\":%u,\"app\":\"%s\",\"how\":\"%s\"}\n", w.damaged, app, w.cut ? "cut" : "flip");
  else puts("typed cache | typed cache clear | typed cache corrupt APP [flip|cut] | typed cache verify [APP]");
}
