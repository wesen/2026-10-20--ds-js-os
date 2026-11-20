#include "mobile_painter_p4.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "esp_elf.h"
#include "p4.h"

typedef int (*paint_entry)(const void *state, void *out);

// The typed buffer ABI starts with a u32 capacity, followed by u16 cells.
typedef struct {
  uint32_t capacity;
  uint16_t cells[MOBILE_PAINTER_STATE_CELLS];
} state_buffer;

typedef struct {
  uint32_t capacity;
  uint16_t words[MOBILE_PAINTER_MAX_WORDS];
} draw_buffer;

struct mobile_painter {
  esp_elf_t module;
  paint_entry entry;
  draw_buffer draw;
};

_Static_assert(offsetof(state_buffer, cells) == 4, "typed state buffer layout");
_Static_assert(offsetof(draw_buffer, words) == 4, "typed drawing buffer layout");

bool mobile_painter_source_allowed(const char *source, size_t length) {
  if (!source || !length || length > MOBILE_PAINTER_SOURCE_MAX) return false;
  size_t known_length = 0;
  char *known = p4_bundle_read("chess/painter.typed", &known_length, NULL, 0);
  bool allowed = known && length == known_length && !memcmp(source, known, length);
  free(known);
  return allowed;
}

mobile_painter_image mobile_painter_compile(const char *source, size_t length,
                                            mobile_painter_install_stats *stats) {
  mobile_painter_image image = {0};
  if (stats) *stats = (mobile_painter_install_stats){0};
  if (!mobile_painter_source_allowed(source, length)) return image;

  size_t reactor_length = 0;
  char *reactor = p4_bundle_read("painter/slot.elf", &reactor_length, NULL, 0);
  if (!reactor) return image;
  // Wall time includes intervals when higher-priority UI work preempts the worker.
  const p4_compile_limits limits = {.heap_bytes = 2 * 1024 * 1024, .duration_us = 8000000};
  vtime_t started = port_clock();
  // Compile the bytes delivered by Chess. The firmware copy only authorizes them.
  image.bytes = p4_typed_compile("mobile-painter", "screen-message", source, length,
                                 "painter/link.js", "linkMobilePainter", ENG_NATIVE, reactor,
                                 reactor_length, &image.length, started, &limits);
  if (stats) {
    stats->compile_us = port_clock() - started;
    stats->image_bytes = image.length;
  }
  free(reactor);
  return image;
}

mobile_painter *mobile_painter_load(mobile_painter_image image, mobile_painter_install_stats *stats) {
  if (!image.bytes) return NULL;
  vtime_t started = port_clock();
  mobile_painter *painter = port_big_calloc(sizeof(*painter));
  if (!painter) {
    free(image.bytes);
    return NULL;
  }
  int rc = esp_elf_init(&painter->module);
  if (!rc) rc = esp_elf_relocate(&painter->module, (const uint8_t *)image.bytes, image.length);
  if (!rc) {
    char *args[] = {(char *)&painter->entry};
    rc = esp_elf_request(&painter->module, 0, 1, args);
  }
  free(image.bytes);
  if (stats) stats->relocate_us = port_clock() - started;
  if (rc || !painter->entry) {
    printf("mobile-painter relocation rejected rc=%d\n", rc);
    mobile_painter_free(painter);
    return NULL;
  }
  painter->draw.capacity = MOBILE_PAINTER_MAX_WORDS;
  return painter;
}

void mobile_painter_free(mobile_painter *painter) {
  if (!painter) return;
  esp_elf_deinit(&painter->module);
  port_big_free(painter);
}

int mobile_painter_run(mobile_painter *painter, const uint16_t cells[MOBILE_PAINTER_STATE_CELLS],
                       uint16_t words[MOBILE_PAINTER_MAX_WORDS], int64_t *native_us) {
  if (native_us) *native_us = 0;
  if (!painter || !cells || !words) return -1;
  state_buffer input = {.capacity = MOBILE_PAINTER_STATE_CELLS};
  memcpy(input.cells, cells, sizeof(input.cells));
  vtime_t started = port_clock();
  int count = painter->entry(&input, &painter->draw);
  if (native_us) *native_us = port_clock() - started;
  if (count <= 0 || count > MOBILE_PAINTER_MAX_WORDS) return -1;
  memcpy(words, painter->draw.words, (size_t)count * sizeof(*words));
  return count;
}
