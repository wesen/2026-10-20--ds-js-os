#include "p4.h"
#include "esp_cpu.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { CAPACITY = 16384, SAMPLES = 11, CALLS = 8, COMPILES = 5 };
typedef struct { uint32_t capacity; uint16_t data[CAPACITY]; } literal_buffer;
typedef int (*writer)(literal_buffer *);
extern int literal_stock(literal_buffer *);
extern int literal_half(literal_buffer *);
extern int literal_word(literal_buffer *);

static const writer writers[] = {literal_stock, literal_half, literal_word};
static const char *const arms[] = {"stock", "half", "word"};

static bool writer_trials(void) {
  size_t length = 0;
  char *expected = p4_bundle_read("chess/painter.typed", &length, NULL, 0);
  literal_buffer *buffer = heap_caps_aligned_alloc(64, sizeof(*buffer), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  bool pass = expected && buffer && length <= CAPACITY;
  uint32_t cycles[3][SAMPLES];
  if (pass) {
    buffer->capacity = CAPACITY;
    for (unsigned sample = 0; sample < SAMPLES; sample++) {
      for (unsigned offset = 0; offset < 3; offset++) {
        unsigned arm = (sample + offset) % 3;
        memset(buffer->data, 0xa5, sizeof(buffer->data));
        writers[arm](buffer);
        uint32_t start = esp_cpu_get_cycle_count();
        int wrote = 0;
        for (unsigned i = 0; i < CALLS; i++) wrote = writers[arm](buffer);
        cycles[arm][sample] = (esp_cpu_get_cycle_count() - start) / CALLS;
        pass &= wrote >= 0 && (size_t)wrote == length && buffer->capacity == CAPACITY;
        for (size_t i = 0; i < length; i++) pass &= buffer->data[i] == (uint8_t)expected[i];
        for (size_t i = length; i < CAPACITY; i++) pass &= buffer->data[i] == 0xa5a5;
        vTaskDelay(1);
      }
    }
    for (unsigned arm = 0; arm < 3; arm++) {
      printf("LIT_WRITE %s", arms[arm]);
      for (unsigned i = 0; i < SAMPLES; i++) printf(" %" PRIu32, cycles[arm][i]);
      puts("");
    }
  }
  free(expected);
  heap_caps_free(buffer);
  return pass;
}

static bool compile_trials(const char *world) {
  char path[64], label[64];
  size_t source_len = 0, reactor_len = 0;
  snprintf(path, sizeof(path), "%s/%s.typed", world, world);
  char *source = p4_bundle_read(path, &source_len, NULL, 0);
  snprintf(path, sizeof(path), "%s/reactor.bin", world);
  char *reactor = p4_bundle_read(path, &reactor_len, NULL, 0);
  const char *const entries[] = {"compileTypedWorldRv32", "compileLiteralHalf", "compileLiteralWord"};
  static const p4_compile_limits limits = {.heap_bytes = 4 * 1024 * 1024, .duration_us = 9000000};
  bool pass = source && reactor;
  if (pass) {
    for (unsigned sample = 0; sample < COMPILES; sample++) {
      for (unsigned offset = 0; offset < 3; offset++) {
        unsigned arm = (sample + offset) % 3;
        snprintf(label, sizeof(label), "lit-%s-%s", world, arms[arm]);
        size_t bytes = 0;
        char *compiled = p4_typed_compile(label, "bundle", source, source_len, "typed/world.js",
                                        entries[arm], ENG_NATIVE, reactor, reactor_len,
                                        &bytes, port_clock(), &limits);
        pass &= compiled && bytes == reactor_len;
        free(compiled);
        vTaskDelay(1);
      }
    }
  }
  free(source);
  free(reactor);
  return pass;
}

static void literal_task(void *unused) {
  (void)unused;
  printf("LIT_BEGIN core=%d copy_samples=%u calls=%u compile_samples=%u\n",
         xPortGetCoreID(), (unsigned)SAMPLES, (unsigned)CALLS, (unsigned)COMPILES);
  bool copy = writer_trials();
  bool chess = compile_trials("chess");
  bool editor = compile_trials("editor");
  printf("LIT_DONE %s\n", (copy && chess && editor) ? "ok" : "FAIL");
  fflush(stdout);
  vTaskDeleteWithCaps(NULL);
}

void literal_bench(void) {
  static bool started;
  if (!started)
    started = xTaskCreatePinnedToCoreWithCaps(literal_task, "literal-bench", 80 * 1024, NULL,
                  2, NULL, 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) == pdPASS;
  if (!started) puts("LIT_DONE task-allocation-failed");
}
