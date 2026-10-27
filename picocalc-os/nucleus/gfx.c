// Pixel primitives on DMA framebuffers. The compositor (JS) lays out and decides what to draw; these
// do the per-pixel work, and charge it to the calling world's turn on the virtual clock.
//
// Pixels are pixel_t: RGB565 on the PicoCalc, 8-bit gray with NUCLEUS_GRAY8. Fonts are 4-bit alpha cells;
// a font with an advance table (the PaperS3's) is proportional, one without (the PicoCalc's) is monospace.
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"
#ifdef NUCLEUS_FONT_HEADER
#include NUCLEUS_FONT_HEADER
#else
#include "font_data.h"
#endif

static inline void charge(double ns) { K.seg_cost += (vtime_t)(ns / 1000.0); }

pixel_t gfx_color(const char *s) {
  if (!s) return 0;
  if (s[0] == '#') s++;
  unsigned v = (unsigned)strtoul(s, NULL, 16);
  if (strlen(s) == 3) v = ((v >> 8 & 15) * 0x110000) | ((v >> 4 & 15) * 0x1100) | ((v & 15) * 0x11);
#ifdef NUCLEUS_GRAY8
  return (pixel_t)((299 * (v >> 16 & 255) + 587 * (v >> 8 & 255) + 114 * (v & 255)) / 1000);
#else
  return (pixel_t)(((v >> 19) & 31) << 11 | ((v >> 10) & 63) << 5 | ((v >> 3) & 31));
#endif
}

static bool clip(dmabuf_t *b, int *x, int *y, int *w, int *h) {
  if (*x < 0) { *w += *x; *x = 0; }
  if (*y < 0) { *h += *y; *y = 0; }
  if (*x + *w > b->w) *w = b->w - *x;
  if (*y + *h > b->h) *h = b->h - *y;
  return *w > 0 && *h > 0;
}

void gfx_fill(dmabuf_t *b, int x, int y, int w, int h, pixel_t c) {
  if (!clip(b, &x, &y, &w, &h)) return;
  for (int j = 0; j < h; j++) {
    pixel_t *p = b->back + (size_t)(y + j) * b->w + x;
    for (int i = 0; i < w; i++) p[i] = c;
  }
  charge((double)w * h * PROFILE.fill_ns_per_px);
}

void gfx_rect(dmabuf_t *b, int x, int y, int w, int h, pixel_t c) {
  gfx_fill(b, x, y, w, 1, c); gfx_fill(b, x, y + h - 1, w, 1, c);
  gfx_fill(b, x, y, 1, h, c); gfx_fill(b, x + w - 1, y, 1, h, c);
}

void gfx_line(dmabuf_t *b, int x0, int y0, int x1, int y1, pixel_t c) {
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
static inline int advance(const font_def_t *F, int gi) { return F->adv ? F->adv[gi] : F->w; }

static inline pixel_t blend(pixel_t bg, pixel_t fg, int a) {   // a in 0..15
  if (a == 0) return bg;
  if (a == 15) return fg;
#ifdef NUCLEUS_GRAY8
  return (pixel_t)((bg * (15 - a) + fg * a) / 15);
#else
  int r = ((bg >> 11) * (15 - a) + (fg >> 11) * a) / 15;
  int g = (((bg >> 5) & 63) * (15 - a) + ((fg >> 5) & 63) * a) / 15;
  int b = ((bg & 31) * (15 - a) + (fg & 31) * a) / 15;
  return (pixel_t)(r << 11 | g << 5 | b);
#endif
}

// A glyph's cell is w x h alpha values; a proportional font's cell starts F->pad pixels left of the pen.
static void glyph(dmabuf_t *b, int x, int y, int f, int gi, pixel_t fg) {
  const font_def_t *F = &font_table[f];
  const uint8_t *g = F->data + (size_t)gi * ((F->w * F->h + 1) / 2);
  x -= F->pad;
  for (int j = 0; j < F->h; j++) {
    int py = y + j;
    if (py < 0 || py >= b->h) continue;
    for (int i = 0; i < F->w; i++) {
      int px = x + i;
      if (px < 0 || px >= b->w) continue;
      int k = j * F->w + i;
      int a = (k & 1) ? (g[k >> 1] & 15) : (g[k >> 1] >> 4);
      if (a) { pixel_t *p = b->back + (size_t)py * b->w + px; *p = blend(*p, fg, a); }
    }
  }
  charge((double)F->w * F->h * PROFILE.text_ns_per_px);
}

int gfx_measure(const char *s, int f) {
  if (f < 0 || f >= FONT_COUNT) f = 1;
  const font_def_t *F = &font_table[f];
  int w = 0;
  while (*s) w += advance(F, glyph_index(utf8_next(&s)));
  return w;
}

// Draw a line of text; if it is wider than max_w (> 0), cut it and end it with an ellipsis.
// Returns the width drawn.
int gfx_text(dmabuf_t *b, int x, int y, const char *s, int f, pixel_t fg, int max_w) {
  if (f < 0 || f >= FONT_COUNT) f = 1;
  const font_def_t *F = &font_table[f];
  int ell = glyph_index(0x2026);
  bool cut = max_w > 0 && gfx_measure(s, f) > max_w;
  int room = max_w - advance(F, ell), x0 = x;
  while (*s) {
    int gi = glyph_index(utf8_next(&s)), a = advance(F, gi);
    if (cut && x - x0 + a > room) { glyph(b, x, y, f, ell, fg); x += advance(F, ell); break; }
    if (gi) glyph(b, x, y, f, gi, fg);   // glyph 0 is the space
    x += a;
  }
  return x - x0;
}

// Word-wrap s to max_w pixels: paragraphs at "\n", words broken where a word alone is too wide.
char *gfx_wrap_json(const char *s, int f, int max_w) {
  if (f < 0 || f >= FONT_COUNT) f = 1;
  const font_def_t *F = &font_table[f];
  int space = advance(F, 0);
  sbuf_t out = { 0 }, line = { 0 };
  int lw = 0, lines = 0;
  sb_add(&out, "[");
  #define FLUSH() do { sb_add(&out, lines++ ? "," : ""); sb_json_str(&out, line.s ? line.s : ""); free(line.s); line = (sbuf_t){ 0 }; lw = 0; } while (0)
  const char *p = s;
  for (;;) {
    const char *w0 = p;
    while (*p && *p != ' ' && *p != '\n') p++;
    int wlen = (int)(p - w0);
    char word[512];
    snprintf(word, sizeof word, "%.*s", wlen < 511 ? wlen : 511, w0);
    int ww = gfx_measure(word, f);
    if (lw && lw + space + ww > max_w) FLUSH();
    if (ww > max_w) {   // a word wider than the line: break it at the last character that fits
      const char *q = word;
      while (*q) {
        const char *c0 = q;
        int a = advance(F, glyph_index(utf8_next(&q)));
        if (lw && lw + a > max_w) FLUSH();
        sb_printf(&line, "%.*s", (int)(q - c0), c0);
        lw += a;
      }
    } else {
      if (lw) { sb_add(&line, " "); lw += space; }
      sb_add(&line, word);
      lw += ww;
    }
    if (!*p) break;
    if (*p == '\n') FLUSH();
    p++;
  }
  FLUSH();
  #undef FLUSH
  sb_add(&out, "]");
  charge((double)strlen(s) * 40);
  return out.s;
}

char *gfx_fonts_json(void) {
  sbuf_t b = { 0 };
  sb_add(&b, "{");
  for (int i = 0; i < FONT_COUNT; i++) sb_printf(&b, "%s\"%s\":[%d,%d]", i ? "," : "", font_table[i].name, advance(&font_table[i], '0' - 32), font_table[i].h);
  sb_add(&b, "}");
  return b.s;
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
      const pixel_t *bp = b->back + (size_t)y * b->w, *fp = b->front + (size_t)y * b->w;
      if (!memcmp(bp, fp, (size_t)b->w * sizeof(pixel_t))) continue;
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
      memcpy(b->front + (size_t)y * b->w + p[0], b->back + (size_t)y * b->w + p[0], (size_t)p[2] * sizeof(pixel_t));
  }
  charge((double)b->w * b->h * PROFILE.diff_ns_per_px);
  return n;
}
