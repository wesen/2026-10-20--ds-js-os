#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum { CHESS_PSIX_CELLS = 90, CHESS_PSIX_MAX = 329, CHESS_PAINTER_SOURCE_MAX = 16384 };

/* 64 pieces, 8 rank masks, then 9 signed values as low/high cell pairs. */
size_t chess_psix_encode(const uint16_t cells[CHESS_PSIX_CELLS], uint8_t *packet, size_t capacity);
bool chess_psix_decode(const uint8_t *packet, size_t length, uint16_t cells[CHESS_PSIX_CELLS]);
