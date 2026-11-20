#include "painter_commands.h"
#if PICOCALC_CHESS_3D
#include "painter_triangle.h"
#endif

static bool read_text(const uint16_t *src, size_t n, char *out) {
  for (size_t i = 0; i < n; i++) {
    if (src[i] < 32 || src[i] > 126) return false;
    out[i] = (char)src[i];
  }
  out[n] = 0;
  return true;
}

bool painter_commands_valid(const uint16_t *words, size_t count, char hints[MOBILE_PAINTER_MAX_TEXT + 1]) {
  if (!words || !hints || !count || count > MOBILE_PAINTER_MAX_WORDS) return false;
  size_t at = 0, ops = 0;
  char text[MOBILE_PAINTER_MAX_TEXT + 1];
  while (at < count && ++ops <= MOBILE_PAINTER_MAX_COMMANDS) {
    uint16_t op = words[at++];
    const uint16_t *p = words + at;
    size_t left = count - at;
    if (op == MOBILE_PAINTER_HINTS)
      return left && p[0] <= MOBILE_PAINTER_MAX_TEXT && left == (size_t)1 + p[0] && read_text(p + 1, p[0], hints);
#if PICOCALC_CHESS_3D
    if (op == MOBILE_PAINTER_TRIANGLE) {
      if (left < 7) return false;
      for (int i = 0; i < 3; ++i)
        if (p[2*i] >= PAINTER_WIDTH || p[2*i+1] >= PAINTER_HEIGHT) return false;
      at += 7;
      continue;
    }
#endif
    if (op == MOBILE_PAINTER_RECT || op == MOBILE_PAINTER_FILL) {
      if (left < 5 || !p[2] || !p[3] || p[0] + p[2] > PAINTER_WIDTH || p[1] + p[3] > PAINTER_HEIGHT) return false;
      at += 5;
    } else if (op == MOBILE_PAINTER_TEXT) {
      if (left < 6 || p[2] > 2 || p[5] > MOBILE_PAINTER_MAX_TEXT || left - 6 < p[5]) return false;
      int cw, ch;
      gfx_font_size(p[2], &cw, &ch);
      if (p[0] >= PAINTER_WIDTH || p[1] + ch > PAINTER_HEIGHT || p[4] > PAINTER_WIDTH - p[0]) return false;
      int max_width = p[4] ? p[4] : PAINTER_WIDTH - p[0];
      // The existing renderer emits a whole ellipsis glyph when text overflows.
      if ((p[5] && max_width < cw) || !read_text(p + 6, p[5], text)) return false;
      at += 6 + p[5];
    } else return false;
  }
  return false;
}

void painter_commands_draw(dmabuf_t *buffer, const uint16_t *words, size_t count) {
  for (size_t at = 0; at < count;) {
    uint16_t op = words[at++];
    const uint16_t *p = words + at;
    if (op == MOBILE_PAINTER_HINTS) return;
#if PICOCALC_CHESS_3D
    if (op == MOBILE_PAINTER_TRIANGLE) {
      painter_triangle(buffer, p);
      at += 7;
      continue;
    }
#endif
    int x = p[0], y = PAINTER_TOP + p[1];
    if (op == MOBILE_PAINTER_TEXT) {
      char text[MOBILE_PAINTER_MAX_TEXT + 1];
      read_text(p + 6, p[5], text);
      gfx_text(buffer, x, y, text, p[2], p[3], p[4] ? p[4] : PAINTER_WIDTH - x);
      at += 6 + p[5];
    } else {
      if (op == MOBILE_PAINTER_RECT) gfx_rect(buffer, x, y, p[2], p[3], p[4]);
      else gfx_fill(buffer, x, y, p[2], p[3], p[4]);
      at += 5;
    }
  }
}
