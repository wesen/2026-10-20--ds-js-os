#pragma once

#include <stdint.h>

enum {
  MOBILE_PAINTER_STATE_CELLS = 90,
#if PICOCALC_CHESS_3D
  // The compositor appends the camera phase (0..31) after the 90 wire cells.
  MOBILE_PAINTER_INPUT_CELLS = MOBILE_PAINTER_STATE_CELLS + 1,
  MOBILE_PAINTER_MAX_WORDS = 12288,
  MOBILE_PAINTER_MAX_COMMANDS = 1536,
#else
  MOBILE_PAINTER_INPUT_CELLS = MOBILE_PAINTER_STATE_CELLS,
  MOBILE_PAINTER_MAX_WORDS = 4096,
  MOBILE_PAINTER_MAX_COMMANDS = 274,
#endif
  MOBILE_PAINTER_MAX_TEXT = 64,
  MOBILE_PAINTER_SOURCE_MAX = 16384,
};

// Cells 0..63 are dense pieces, 64..71 are rank masks, then nine
// signed i32s as low and high cells: cursor, selected, from, to, status,
// hint, depth, nodes, score. An absent square is 64.
// Drawing coordinates are relative to the (0, 22) body origin on PicoCalc.
// FILL/RECT: op, x, y, w, h, RGB565.
// TEXT: op, x, y, font (s=0, m=1, mb=2), RGB565, maxWidth, n, n ASCII cells.
// Zero maxWidth means the available width to the edge of the body.
// HINTS: op, n, n ASCII cells. Every result ends with exactly one HINTS.
enum mobile_painter_op {
  MOBILE_PAINTER_FILL = 1,
  MOBILE_PAINTER_RECT = 2,
  MOBILE_PAINTER_TEXT = 3,
  MOBILE_PAINTER_HINTS = 4,
  MOBILE_PAINTER_TRIANGLE = 5,  // three body-relative coordinate pairs followed by RGB565
};
