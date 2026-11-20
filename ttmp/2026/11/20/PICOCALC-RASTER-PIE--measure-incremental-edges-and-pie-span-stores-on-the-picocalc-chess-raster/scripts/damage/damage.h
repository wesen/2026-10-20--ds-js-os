#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "painter_commands.h"

typedef struct { int x0, y0, x1, y1; } damage_box;
typedef enum { DAMAGE_NONE, DAMAGE_PARTIAL, DAMAGE_FULL } damage_mode;
typedef struct {
    damage_mode mode;
    damage_box body;
    unsigned replayed;
} damage_stats;

// The next list must be a complete matte-first scene. Any supplied list must pass
// painter_commands_valid before this call. The caller owns hint and chrome updates.
// Set force_full if the displayed buffer/key differs, including a camera or overlay change.
void damage_draw(dmabuf_t *fb, const uint16_t *previous, size_t previous_count,
                 const uint16_t *next, size_t next_count, bool force_full, damage_stats *stats);
