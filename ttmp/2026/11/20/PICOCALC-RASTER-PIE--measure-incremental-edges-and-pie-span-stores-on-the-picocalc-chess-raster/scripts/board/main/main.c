#include "common.h"
#include "esp_cpu.h"
#include "esp_heap_caps.h"
#include "esp_rom_crc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

kernel_t K;
profile_t PROFILE;
extern const uint8_t raster_fixture_begin[], raster_fixture_end[];
extern void damage_benchmark(void);

enum { samples = 11, repeats = 2, corners = 51 };
static const size_t frame_bytes = pixel_count * sizeof(pixel_t);

typedef struct {
  char name[16];
  uint32_t length;
  uint16_t words[];
} fixture;

static bool timed(const char *name) {
  return !strncmp(name, "e", 1) || !strcmp(name, "f3") || !strcmp(name, "high") ||
         !strcmp(name, "low") || !strcmp(name, "pos-23") || !strcmp(name, "pos-46");
}

static uint32_t run(raster_fn render, pixel_t *pixels, uint16_t *words, size_t count, bool validate) {
  uint32_t start = esp_cpu_get_cycle_count();
  for (unsigned i = 0; i < repeats; i++) {
    char hints[MOBILE_PAINTER_MAX_TEXT + 1];
    dmabuf_t fb = raster_buffer(pixels);
    K.seg_cost = 0;
    if (validate && !painter_commands_valid(words, count, hints)) abort();
    render(&fb, words, count);
  }
  return (esp_cpu_get_cycle_count() - start) / repeats;
}

static void measure(const fixture *fx, pixel_t *actual, uint16_t *words) {
  for (unsigned validate = 0; validate < 2; validate++) {
    uint32_t cycles[arms][samples];
    for (unsigned sample = 0; sample < samples; sample++) {
      for (unsigned arm = 0; arm < arms; arm++) {
        unsigned lane = (sample + arm) % arms;
        run(renderers[lane], actual, words, fx->length, validate);
        cycles[lane][sample] = run(renderers[lane], actual, words, fx->length, validate);
        vTaskDelay(1);
      }
    }
    for (unsigned arm = 0; arm < arms; arm++) {
      printf("RASTER_CYCLES %s %s %u", fx->name, arm_names[arm], validate);
      for (unsigned sample = 0; sample < samples; sample++) printf(" %" PRIu32, cycles[arm][sample]);
      printf("\n");
    }
  }
}

void app_main(void) {
  vTaskDelay(pdMS_TO_TICKS(1200));
  int flags = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
  pixel_t *reference = heap_caps_aligned_alloc(64, frame_bytes, flags);
  pixel_t *actual = heap_caps_aligned_alloc(64, frame_bytes, flags);
  uint16_t *words = heap_caps_aligned_alloc(64, MOBILE_PAINTER_MAX_WORDS * 2, flags);
  if (!reference || !actual || !words) abort();
  PROFILE.fill_ns_per_px = 2.5;
  for (;;) {
    unsigned n = 0;
    bool all = true;
    printf("RASTER_BEGIN psram-align=64 profile=2.5 samples=%u calls=%u core=%d\n",
           (unsigned)samples, (unsigned)repeats, xPortGetCoreID());
    const uint8_t *start = raster_fixture_begin;
    while (start < raster_fixture_end) {
      const fixture *fx = (const fixture *)start;
      if (fx->length > MOBILE_PAINTER_MAX_WORDS) abort();
      size_t size = fx->length * sizeof(*words);
      memcpy(words, fx->words, size);
      char hints[MOBILE_PAINTER_MAX_TEXT + 1];
      if (!painter_commands_valid(words, fx->length, hints)) abort();
      memset(reference, 0xa5, frame_bytes);
      dmabuf_t control = raster_buffer(reference);
      K.seg_cost = 17;
      painter_commands_draw(&control, words, fx->length);
      const vtime_t time = K.seg_cost;
      for (unsigned arm = 1; arm < arms; arm++) {
        memset(actual, 0xa5, frame_bytes);
        dmabuf_t fb = raster_buffer(actual);
        K.seg_cost = 17;
        renderers[arm](&fb, words, fx->length);
        all &= !memcmp(reference, actual, frame_bytes) && fb.dirty == control.dirty && K.seg_cost == time;
      }
      uint32_t crc = esp_rom_crc32_le(0, (const void *)reference, frame_bytes);
      printf("RASTER_CASE %s %08" PRIx32 " %016" PRIx64 " %" PRId64 " %s\n",
             fx->name, crc, control.dirty, time - 17, all ? "ok" : "FAIL");
      if (timed(fx->name)) measure(fx, actual, words);
      n++;
      start += (20 + size + 3) & ~3u;
    }
    damage_benchmark();
    printf("RASTER_DONE %u %s\n", n, all && n == corners ? "ok" : "FAIL");
    vTaskDelay(pdMS_TO_TICKS(3000));
  }
}
