#pragma once

#include "nucleus.h"
#include "mobile_painter.h"

enum { PAINTER_WIDTH = 320, PAINTER_TOP = 22, PAINTER_HEIGHT = 280 };

// Validate the complete program before replacing a retained display list.
// A valid list can be replayed on an ordinary 320 x 320 compositor buffer.
bool painter_commands_valid(const uint16_t *words, size_t count, char hints[MOBILE_PAINTER_MAX_TEXT + 1]);
void painter_commands_draw(dmabuf_t *buffer, const uint16_t *valid_words, size_t count);
