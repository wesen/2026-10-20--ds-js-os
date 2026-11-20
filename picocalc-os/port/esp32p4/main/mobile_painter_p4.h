#pragma once

#include <stdbool.h>
#include <stddef.h>
#include "mobile_painter.h"

typedef struct mobile_painter mobile_painter;

typedef struct {
  size_t image_bytes;
  int64_t compile_us;
  int64_t relocate_us;
} mobile_painter_install_stats;

bool mobile_painter_source_allowed(const char *source, size_t length);

// Called from a worker. The caller retains the source only until this returns.
mobile_painter *mobile_painter_install(const char *source, size_t length,
                                      mobile_painter_install_stats *stats);
void mobile_painter_free(mobile_painter *painter);

// One owner per handle. On success returns the number of words written to the
// caller's scratch. The consumer validates every record before drawing.
int mobile_painter_run(mobile_painter *painter, const uint16_t cells[MOBILE_PAINTER_STATE_CELLS],
                       uint16_t words[MOBILE_PAINTER_MAX_WORDS], int64_t *native_us);
