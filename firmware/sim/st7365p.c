// A model of the PicoCalc's ST7365P panel, fed by the SPI bytes the JS display driver sends.
// It keeps the controller's state (sleep, display on, pixel format, MADCTL, inversion, window) and its
// memory, so a capture shows what the glass would show, including the effect of driver mistakes.
//
// How this panel is wired, inferred from the validated init in picocalc_lcd.c (MADCTL 0x48, INVON):
//  - columns are scanned mirrored, so MX=1 gives an upright image;
//  - the panel is BGR, so MADCTL.BGR=1 shows RGB565 data with the right colours;
//  - the panel inverts, so INVON shows true colours.
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "picocalc.h"

#define W 320
#define H 320
#define GRAM_H 480

static struct {
  uint16_t gram[W * GRAM_H];
  bool sleeping, display_on, inverted;
  uint8_t colmod, madctl;
  int c0, c1, r0, r1;       // window
  int cx, cy;               // write pointer
  int cmd;                  // command whose data is arriving
  uint8_t pbuf[8]; int pn;  // parameter bytes
  uint8_t pix[3]; int pixn; // partial pixel
  vtime_t t_reset, t_slpout;
  int warnings;
  uint64_t pixels_written;
} P;

static void warn(vtime_t t, const char *fmt, const char *a) {
  P.warnings++;
  fprintf(stderr, "[%9.3f ms] panel: ", t / 1000.0);
  fprintf(stderr, fmt, a);
  fputc('\n', stderr);
}

void st7365p_reset(void) {
  memset(&P, 0, sizeof(P));
  P.sleeping = true; P.colmod = 0x66; P.c1 = W - 1; P.r1 = GRAM_H - 1;
  for (int i = 0; i < W * GRAM_H; i++) P.gram[i] = (uint16_t)(rand() & 0xffff);   // power-on noise
  P.t_reset = -MS(1000); P.t_slpout = -MS(1000);
}

void st7365p_cmd(uint8_t cmd, vtime_t t) {
  if (t - P.t_reset < MS(5)) warn(t, "command 0x%s arrived less than 5 ms after SWRESET", (char[]){ "0123456789abcdef"[cmd >> 4], "0123456789abcdef"[cmd & 15], 0 });
  P.cmd = cmd; P.pn = 0; P.pixn = 0;
  switch (cmd) {
    case 0x01: { vtime_t keep = t; uint64_t pw = P.pixels_written; int wn = P.warnings; st7365p_reset(); P.t_reset = keep; P.pixels_written = pw; P.warnings = wn; } break;
    case 0x10: P.sleeping = true; break;
    case 0x11: P.sleeping = false; P.t_slpout = t; break;
    case 0x20: P.inverted = false; break;
    case 0x21: P.inverted = true; break;
    case 0x28: P.display_on = false; break;
    case 0x29:
      if (t - P.t_slpout < MS(120)) warn(t, "DISPON %s less than 120 ms after SLPOUT", "sent");
      P.display_on = true; break;
    case 0x2C: P.cx = P.c0; P.cy = P.r0; break;
    default: break;
  }
}

static void put_pixel(uint16_t v) {
  if (P.cy > P.r1) return;                         // past the window: the controller ignores it
  int col = P.cx, row = P.cy;
  if (P.madctl & 0x20) { int s = col; col = row; row = s; }      // MV: exchange rows and columns
  int x = (P.madctl & 0x40) ? col : (W - 1 - col);               // mirrored scan, MX undoes it
  int y = (P.madctl & 0x80) ? (GRAM_H - 1 - row) : row;
  if (x >= 0 && x < W && y >= 0 && y < GRAM_H) P.gram[y * W + x] = v;
  P.pixels_written++;
  if (++P.cx > P.c1) { P.cx = P.c0; P.cy++; }
}

void st7365p_data(const uint8_t *d, int n, vtime_t t) {
  if (P.cmd == 0x2C || P.cmd == 0x3C) {
    if (P.sleeping) { warn(t, "pixel data while the panel %s (no SLPOUT)", "sleeps"); }
    int bpp = (P.colmod & 0x07) == 0x05 ? 2 : 3;
    for (int i = 0; i < n; i++) {
      P.pix[P.pixn++] = d[i];
      if (P.pixn == bpp) {
        uint16_t v = bpp == 2 ? (uint16_t)(P.pix[0] << 8 | P.pix[1])
                              : (uint16_t)(((P.pix[0] >> 3) << 11) | ((P.pix[1] >> 2) << 5) | (P.pix[2] >> 3));
        put_pixel(v); P.pixn = 0;
      }
    }
    return;
  }
  for (int i = 0; i < n && P.pn < 8; i++) P.pbuf[P.pn++] = d[i];
  switch (P.cmd) {
    case 0x2A: if (P.pn >= 4) { P.c0 = P.pbuf[0] << 8 | P.pbuf[1]; P.c1 = P.pbuf[2] << 8 | P.pbuf[3]; } break;
    case 0x2B: if (P.pn >= 4) { P.r0 = P.pbuf[0] << 8 | P.pbuf[1]; P.r1 = P.pbuf[2] << 8 | P.pbuf[3]; } break;
    case 0x36: if (P.pn >= 1) P.madctl = P.pbuf[0]; break;
    case 0x3A: if (P.pn >= 1) P.colmod = P.pbuf[0]; break;
    default: break;
  }
}

int st7365p_capture_png(const char *path, int scale) {
  if (scale < 1) scale = 1;
  int bl = stm32_backlight();
  bool lit = P.display_on && !P.sleeping && bl > 0;
  uint8_t *rgb = malloc((size_t)W * scale * H * scale * 3);
  for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
    uint16_t v = P.gram[y * W + x];
    if (!P.inverted) v = (uint16_t)~v;                 // the panel inverts unless told not to
    int r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;
    if (!(P.madctl & 0x08)) { int s = r; r = b; b = s; } // a BGR panel shows RGB data swapped without the BGR bit
    uint8_t R = (uint8_t)(r * 255 / 31), G = (uint8_t)(g * 255 / 63), B = (uint8_t)(b * 255 / 31);
    if (!lit) R = G = B = 0;
    for (int sy = 0; sy < scale; sy++) for (int sx = 0; sx < scale; sx++) {
      uint8_t *p = rgb + (((size_t)(y * scale + sy) * W * scale) + (x * scale + sx)) * 3;
      p[0] = R; p[1] = G; p[2] = B;
    }
  }
  int r = png_write_rgb(path, rgb, W * scale, H * scale);
  free(rgb);
  return r;
}

void st7365p_report(void) {
  fprintf(stderr, "panel: %s, %s, colmod 0x%02x, madctl 0x%02x, %s, %llu pixels written, %d warnings\n",
          P.sleeping ? "sleeping" : "awake", P.display_on ? "display on" : "display off", P.colmod, P.madctl,
          P.inverted ? "inversion on" : "inversion off", (unsigned long long)P.pixels_written, P.warnings);
}
