// Pixel primitives on DMA framebuffers. The compositor (JS) lays out and decides what to draw; these
// do the per-pixel work, and charge it to the calling world's turn on the virtual clock.
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"
#include "font_data.h"

static inline void charge(double ns) { K.seg_cost += (vtime_t)(ns / 1000.0); }

uint16_t gfx_color(const char *s) {
  if (!s) return 0;
  if (s[0] == '#') s++;
  unsigned v = (unsigned)strtoul(s, NULL, 16);
  if (strlen(s) == 3) v = ((v >> 8 & 15) * 0x110000) | ((v >> 4 & 15) * 0x1100) | ((v & 15) * 0x11);
  return (uint16_t)(((v >> 19) & 31) << 11 | ((v >> 10) & 63) << 5 | ((v >> 3) & 31));
}

static bool clip(dmabuf_t *b, int *x, int *y, int *w, int *h) {
  if (*x < 0) { *w += *x; *x = 0; }
  if (*y < 0) { *h += *y; *y = 0; }
  if (*x + *w > b->w) *w = b->w - *x;
  if (*y + *h > b->h) *h = b->h - *y;
  return *w > 0 && *h > 0;
}

void gfx_fill(dmabuf_t *b, int x, int y, int w, int h, uint16_t c) {
  if (!clip(b, &x, &y, &w, &h)) return;
  for (int j = 0; j < h; j++) {
    uint16_t *p = b->back + (size_t)(y + j) * b->w + x;
    for (int i = 0; i < w; i++) p[i] = c;
  }
  charge((double)w * h * PROFILE.fill_ns_per_px);
}

void gfx_rect(dmabuf_t *b, int x, int y, int w, int h, uint16_t c) {
  gfx_fill(b, x, y, w, 1, c); gfx_fill(b, x, y + h - 1, w, 1, c);
  gfx_fill(b, x, y, 1, h, c); gfx_fill(b, x + w - 1, y, 1, h, c);
}

void gfx_line(dmabuf_t *b, int x0, int y0, int x1, int y1, uint16_t c) {
  int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1, e = dx + dy, n = 0;
  for (;;) {
    if (x0 >= 0 && y0 >= 0 && x0 < b->w && y0 < b->h) b->back[(size_t)y0 * b->w + x0] = c;
    n++;
    if (x0 == x1 && y0 == y1) break;
    int e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
  charge(n * PROFILE.fill_ns_per_px * 4);
}

int gfx_font_index(const char *name) {
  for (int i = 0; i < FONT_COUNT; i++) if (!strcmp(font_table[i].name, name)) return i;
  return 1;
}
void gfx_font_size(int f, int *w, int *h) { if (f < 0 || f >= FONT_COUNT) f = 1; *w = font_table[f].w; *h = font_table[f].h; }
const char *gfx_font_names(void) { return "s m mb l xl"; }

static uint32_t utf8_next(const char **ps) {
  const unsigned char *p = (const unsigned char *)*ps;
  uint32_t c = *p++;
  if (c >= 0xF0 && p[0] && p[1] && p[2]) { c = (c & 7) << 18 | (p[0] & 63) << 12 | (p[1] & 63) << 6 | (p[2] & 63); p += 3; }
  else if (c >= 0xE0 && p[0] && p[1]) { c = (c & 15) << 12 | (p[0] & 63) << 6 | (p[1] & 63); p += 2; }
  else if (c >= 0xC0 && p[0]) { c = (c & 31) << 6 | (p[0] & 63); p += 1; }
  *ps = (const char *)p;
  return c;
}
int gfx_text_len(const char *s) { int n = 0; while (*s) { utf8_next(&s); n++; } return n; }

static int glyph_index(uint32_t cp) {
  if (cp >= 32 && cp < 127) return (int)cp - 32;
  for (int i = 95; i < FONT_GLYPHS; i++) if (font_codepoints[i] == cp) return i;
  return '?' - 32;
}

static inline uint16_t blend(uint16_t bg, uint16_t fg, int a) {   // a in 0..15
  if (a == 0) return bg;
  if (a == 15) return fg;
  int r = ((bg >> 11) * (15 - a) + (fg >> 11) * a) / 15;
  int g = (((bg >> 5) & 63) * (15 - a) + ((fg >> 5) & 63) * a) / 15;
  int b = ((bg & 31) * (15 - a) + (fg & 31) * a) / 15;
  return (uint16_t)(r << 11 | g << 5 | b);
}

static void glyph(dmabuf_t *b, int x, int y, int f, int gi, uint16_t fg) {
  const font_def_t *F = &font_table[f];
  const uint8_t *g = F->data + (size_t)gi * ((F->w * F->h + 1) / 2);
  for (int j = 0; j < F->h; j++) {
    int py = y + j;
    if (py < 0 || py >= b->h) continue;
    for (int i = 0; i < F->w; i++) {
      int px = x + i;
      if (px < 0 || px >= b->w) continue;
      int k = j * F->w + i;
      int a = (k & 1) ? (g[k >> 1] & 15) : (g[k >> 1] >> 4);
      if (a) { uint16_t *p = b->back + (size_t)py * b->w + px; *p = blend(*p, fg, a); }
    }
  }
  charge((double)F->w * F->h * PROFILE.text_ns_per_px);
}

// Draw a line of text; if it is wider than max_w (> 0), cut it and end it with an ellipsis.
// Returns the width drawn.
int gfx_text(dmabuf_t *b, int x, int y, const char *s, int f, uint16_t fg, int max_w) {
  if (f < 0 || f >= FONT_COUNT) f = 1;
  int cw = font_table[f].w, n = gfx_text_len(s), fit = n;
  if (max_w > 0 && n * cw > max_w) fit = max_w / cw - 1;
  if (fit < 0) fit = 0;
  int i = 0, x0 = x;
  while (*s && i < fit) { uint32_t cp = utf8_next(&s); if (cp != ' ') glyph(b, x, y, f, glyph_index(cp), fg); x += cw; i++; }
  if (fit < n) { glyph(b, x, y, f, glyph_index(0x2026), fg); x += cw; }
  return x - x0;
}

// Compare what was drawn (back) with what the panel shows (front), copy the changes to front, and
// return the changed areas as rectangles (x, y, w, h), at most one per 16-row band before merging.
int gfx_commit(dmabuf_t *b, int *rects, int max_rects) {
  enum { BAND = 16 };
  int n = 0;
  for (int y0 = 0; y0 < b->h; y0 += BAND) {
    int y1 = y0 + BAND < b->h ? y0 + BAND : b->h;
    int minx = b->w, maxx = -1, miny = b->h, maxy = -1;
    for (int y = y0; y < y1; y++) {
      const uint16_t *bp = b->back + (size_t)y * b->w, *fp = b->front + (size_t)y * b->w;
      if (!memcmp(bp, fp, (size_t)b->w * 2)) continue;
      int l = 0, r = b->w - 1;
      while (bp[l] == fp[l]) l++;
      while (bp[r] == fp[r]) r--;
      if (l < minx) minx = l;
      if (r > maxx) maxx = r;
      if (y < miny) miny = y;
      maxy = y;
    }
    if (maxx < 0) continue;
    int rx = minx, ry = miny, rw = maxx - minx + 1, rh = maxy - miny + 1;
    if (n > 0) {   // merge with the band above when that costs little
      int *p = rects + (n - 1) * 4;
      int ux = p[0] < rx ? p[0] : rx, ur = (p[0] + p[2] > rx + rw ? p[0] + p[2] : rx + rw);
      int uy = p[1], ub = ry + rh;
      long ua = (long)(ur - ux) * (ub - uy), sa = (long)p[2] * p[3] + (long)rw * rh;
      if (p[1] + p[3] == ry && ua * 10 <= sa * 13) { p[0] = ux; p[2] = ur - ux; p[3] = ub - uy; continue; }
    }
    if (n == max_rects) {   // out of room: grow the last one
      int *p = rects + (n - 1) * 4;
      int ux = p[0] < rx ? p[0] : rx, ur = (p[0] + p[2] > rx + rw ? p[0] + p[2] : rx + rw);
      p[0] = ux; p[2] = ur - ux; p[3] = ry + rh - p[1];
      continue;
    }
    rects[n * 4] = rx; rects[n * 4 + 1] = ry; rects[n * 4 + 2] = rw; rects[n * 4 + 3] = rh; n++;
  }
  for (int i = 0; i < n; i++) {
    int *p = rects + i * 4;
    for (int y = p[1]; y < p[1] + p[3]; y++)
      memcpy(b->front + (size_t)y * b->w + p[0], b->back + (size_t)y * b->w + p[0], (size_t)p[2] * 2);
  }
  charge((double)b->w * b->h * PROFILE.diff_ns_per_px);
  return n;
}
