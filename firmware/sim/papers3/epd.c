// A model of the PaperS3's e-paper panel as M5GFX drives it: what the glass shows after each update.
//
// The panel holds 16 gray levels. A "quality" update draws all 16 and leaves nothing of the old picture; a
// "text" update draws all 16 and leaves a faint ghost where pixels changed; "fast" and "fastest" draw only
// black and white (anti-aliased pixels are thresholded, as M5GFX does in those modes) and leave stronger
// ghosts. A ghost is the old pixel showing through, and it accumulates over partial updates until a quality
// update clears it. The durations are what the panel is busy for, per update, whatever its size; they are
// placeholders until the device measures them (design doc, phase 5).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "papers3.h"

static const struct { const char *name; vtime_t us; int ghost; } MODE[EPD_MODES] = {   // ghost: percent of the old pixel
  [EPD_QUALITY] = { "quality", 450000, 0 },
  [EPD_TEXT] = { "text", 300000, 4 },
  [EPD_FAST] = { "fast", 120000, 10 },
  [EPD_FASTEST] = { "fastest", 60000, 18 },
};

static struct {
  uint8_t shown[PANEL_W * PANEL_H];   // the level each pixel was driven to (0..255, 16 steps)
  uint8_t old[PANEL_W * PANEL_H];     // what shows through as a ghost
  uint8_t amt[PANEL_W * PANEL_H];     // how strongly, in percent
  uint64_t updates[EPD_MODES], pixels[EPD_MODES];
  vtime_t busy_us;
} P;

void epd_init(void) {
  memset(&P, 0, sizeof P);
  memset(P.shown, 0xff, sizeof P.shown);   // a blank white panel
  memset(P.old, 0xff, sizeof P.old);
}

static inline uint8_t level16(uint8_t v) { return (uint8_t)((v >> 4) * 17); }

vtime_t epd_update(const pixel_t *src, int stride, int x, int y, int w, int h, int mode, vtime_t t) {
  (void)t;
  if (mode < 0 || mode >= EPD_MODES) mode = EPD_QUALITY;
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  if (x + w > PANEL_W) w = PANEL_W - x;
  if (y + h > PANEL_H) h = PANEL_H - y;
  for (int j = 0; j < h; j++)
    for (int i = 0; i < w; i++) {
      size_t k = (size_t)(y + j) * PANEL_W + x + i;
      uint8_t v = src[(size_t)(y + j) * stride + x + i];
      uint8_t to = mode == EPD_FAST || mode == EPD_FASTEST ? (v >= 128 ? 255 : 0) : level16(v);
      if (mode == EPD_QUALITY) { P.amt[k] = 0; P.old[k] = to; }
      else if (to != P.shown[k]) {
        int a = P.amt[k] + MODE[mode].ghost;
        P.old[k] = P.amt[k] ? P.old[k] : P.shown[k];
        P.amt[k] = (uint8_t)(a > 35 ? 35 : a);
      }
      P.shown[k] = to;
    }
  if (w > 0 && h > 0) { P.updates[mode]++; P.pixels[mode] += (uint64_t)w * h; }
  P.busy_us += MODE[mode].us;
  return MODE[mode].us;
}

int epd_capture_png(const char *path, int scale, bool ghosts) {
  if (scale < 1) scale = 1;
  int W = PANEL_W * scale, H = PANEL_H * scale;
  uint8_t *rgb = malloc((size_t)W * H * 3);
  for (int y = 0; y < H; y++)
    for (int x = 0; x < W; x++) {
      size_t k = (size_t)(y / scale) * PANEL_W + x / scale;
      int v = P.shown[k];
      if (ghosts && P.amt[k]) v = (v * (100 - P.amt[k]) + P.old[k] * P.amt[k]) / 100;
      // the panel's white is a warm light gray and its black a dark gray, not the screen's extremes
      uint8_t *o = rgb + ((size_t)y * W + x) * 3;
      o[0] = (uint8_t)(34 + v * (236 - 34) / 255); o[1] = (uint8_t)(34 + v * (234 - 34) / 255); o[2] = (uint8_t)(32 + v * (226 - 32) / 255);
    }
  int r = png_write_rgb(path, rgb, W, H);
  free(rgb);
  return r;
}

void epd_report(void) {
  printf("panel: %dx%d e-paper, busy %.1f ms in all;", PANEL_W, PANEL_H, P.busy_us / 1000.0);
  for (int m = 0; m < EPD_MODES; m++) printf(" %s %llu (%llu px)", MODE[m].name, (unsigned long long)P.updates[m], (unsigned long long)P.pixels[m]);
  int ghosted = 0;
  for (size_t k = 0; k < sizeof P.amt; k++) ghosted += P.amt[k] > 0;
  printf("; %d pixels carry a ghost\n", ghosted);
}
