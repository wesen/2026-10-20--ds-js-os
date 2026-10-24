// A minimal PNG writer for screen captures (8-bit RGB, no filtering, zlib).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <zlib.h>
#include "nucleus.h"

static void be32(uint8_t *p, uint32_t v) { p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v; }
static void chunk(FILE *f, const char *type, const uint8_t *data, uint32_t n) {
  uint8_t hdr[8]; be32(hdr, n); memcpy(hdr + 4, type, 4);
  fwrite(hdr, 1, 8, f);
  if (n) fwrite(data, 1, n, f);
  uint32_t crc = crc32(0, (const uint8_t *)type, 4);
  crc = crc32(crc, data, n);
  uint8_t c[4]; be32(c, crc); fwrite(c, 1, 4, f);
}

int png_write_rgb(const char *path, const uint8_t *rgb, int w, int h) {
  size_t raw_n = (size_t)h * (1 + (size_t)w * 3);
  uint8_t *raw = malloc(raw_n);
  for (int y = 0; y < h; y++) { raw[y * (1 + w * 3)] = 0; memcpy(raw + y * (1 + w * 3) + 1, rgb + (size_t)y * w * 3, (size_t)w * 3); }
  uLongf zn = compressBound(raw_n);
  uint8_t *z = malloc(zn);
  compress2(z, &zn, raw, raw_n, 6);
  FILE *f = fopen(path, "wb");
  if (!f) { free(raw); free(z); return -1; }
  static const uint8_t sig[8] = { 137, 80, 78, 71, 13, 10, 26, 10 };
  fwrite(sig, 1, 8, f);
  uint8_t ihdr[13]; be32(ihdr, w); be32(ihdr + 4, h); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  chunk(f, "IHDR", ihdr, 13);
  chunk(f, "IDAT", z, (uint32_t)zn);
  chunk(f, "IEND", NULL, 0);
  fclose(f);
  free(raw); free(z);
  return 0;
}
