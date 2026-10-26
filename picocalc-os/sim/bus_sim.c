// The host's bus back ends: transfers on the simulated board. A transfer starts when the bus is free after
// the issuing segment ends, takes the time its bits take on the wire, and settles its promise at the end.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "picocalc.h"

static vtime_t wire_us(double bits, int hz) { return (vtime_t)(bits * 1e6 / (hz > 0 ? hz : 1) + 0.5); }

void bus_run_i2c(deferred_t *d, vtime_t at) {
  handle_t *h = handle_find(d->handle);
  vtime_t start = bus_start(BUS_I2C0, at);
  // a write phase (address + bytes, 9 clocks each), an optional gap with the bus held, then a read phase
  double bits = (d->nbytes ? (1 + d->nbytes) * 9 + 2 : 0) + (d->nread ? (1 + d->nread) * 9 + 2 : 0);
  vtime_t end = start + wire_us(bits, h ? h->hz : 10000) + d->delay;
  uint8_t rd[16] = { 0 };
  char *json;
  int ok = 1;
  if (!h) { json = xstrdup("\"the handle went away before the transfer\""); ok = 0; }
  else if (h->addr != 0x1f) {
    char t[96]; snprintf(t, sizeof t, "\"no device answered at 0x%02x on i2c0\"", h->addr); json = xstrdup(t); ok = 0;
    end = start + wire_us(9 + 2, h->hz);
  } else {
    int got = stm32_i2c(d->bytes, d->nbytes, rd, d->nread > 16 ? 16 : d->nread);
    sbuf_t b = { 0 };
    sb_add(&b, "[");
    for (int i = 0; i < got; i++) sb_printf(&b, "%s%d", i ? "," : "", rd[i]);
    sb_add(&b, "]");
    json = b.s;
  }
  bus_finish(BUS_I2C0, start, end, (uint64_t)(d->nbytes + d->nread + 2), !ok);
  kernel_settle_at(d->w, d->epoch, d->promise, ok, json, end);
  free(d->bytes);
}

void bus_run_spi_cmd(deferred_t *d, vtime_t at) {
  handle_t *h = handle_find(d->handle);
  int hz = h ? h->hz : 1000000;
  vtime_t start = bus_start(BUS_SPI2, at);
  st7365p_cmd((uint8_t)d->op, start);
  if (d->nbytes) st7365p_data(d->bytes, d->nbytes, start + wire_us(8, hz));
  vtime_t end = start + wire_us((1 + d->nbytes) * 8.0, hz) + 2;   // + chip-select and D/C toggling
  bus_finish(BUS_SPI2, start, end, (uint64_t)(1 + d->nbytes), false);
  kernel_settle_at(d->w, d->epoch, d->promise, 1, NULL, end);
  free(d->bytes);
}

void bus_run_spi_pixels(deferred_t *d, vtime_t at) {
  handle_t *h = handle_find(d->handle), *fb = handle_find(d->fb);
  dmabuf_t *b = handle_buf(fb);
  int hz = h ? h->hz : 1000000;
  vtime_t start = bus_start(BUS_SPI2, at);
  if (!b) { kernel_settle_at(d->w, d->epoch, d->promise, 0, xstrdup("\"the framebuffer went away before the transfer\""), start); return; }
  int x = d->x, y = d->y, w = d->wd, hh = d->ht;
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { hh += y; y = 0; }
  if (x + w > b->w) w = b->w - x;
  if (y + hh > b->h) hh = b->h - y;
  size_t n = w > 0 && hh > 0 ? (size_t)w * hh * 2 : 0;
  uint8_t *px = malloc(n + 1);
  size_t k = 0;
  for (int j = 0; j < hh; j++) for (int i = 0; i < w; i++) {
    uint16_t v = b->front[(size_t)(y + j) * b->w + x + i];
    px[k++] = (uint8_t)(v >> 8); px[k++] = (uint8_t)v;     // the panel takes RGB565 big-endian
  }
  enum { CHUNK = 32768 };
  int chunks = 0;
  vtime_t t = start;
  for (size_t off = 0; off < n; off += CHUNK) {
    size_t m = n - off < CHUNK ? n - off : CHUNK;
    st7365p_data(px + off, (int)m, t);
    t += wire_us(m * 8.0, hz) + PROFILE.spi_chunk_us;
    chunks++;
  }
  free(px);
  bus_finish(BUS_SPI2, start, t, n, false);
  kernel_settle_at(d->w, d->epoch, d->promise, 1, NULL, t);
}
