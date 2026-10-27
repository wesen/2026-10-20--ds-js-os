// The PaperS3's bus back ends on the host. i2c1 carries the GT911 (0x5D) and the BM8563 (0x51) at 400 kHz; a
// transfer starts when the bus is free after the issuing segment ends, takes the time its bits take, and
// settles its promise at the end. epd0 is the panel: an update takes as long as its waveform does.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "papers3.h"

static vtime_t wire_us(double bits, int hz) { return (vtime_t)(bits * 1e6 / (hz > 0 ? hz : 1) + 0.5); }

void bus_run_i2c(deferred_t *d, vtime_t at) {
  handle_t *h = handle_find(d->handle);
  int bus = h ? h->bus : 0;
  vtime_t start = bus_start(bus, at);
  double bits = (d->nbytes ? (1 + d->nbytes) * 9 + 2 : 0) + (d->nread ? (1 + d->nread) * 9 + 2 : 0);
  vtime_t end = start + wire_us(bits, h ? h->hz : 400000) + d->delay;
  uint8_t rd[64] = { 0 };
  int nrd = d->nread > 64 ? 64 : d->nread, got = -1, ok = 1;
  char *json;
  if (!h) { json = xstrdup("\"the handle went away before the transfer\""); ok = 0; }
  else {
    if (h->addr == 0x5d) got = gt911_i2c(d->bytes, d->nbytes, rd, nrd, start);
    else if (h->addr == 0x51) got = bm8563_i2c(d->bytes, d->nbytes, rd, nrd, start);
    if (got < 0) {
      char t[96]; snprintf(t, sizeof t, "\"no device answered at 0x%02x on %s\"", h->addr, K.buses[bus].name); json = xstrdup(t); ok = 0;
      end = start + wire_us(9 + 2, h->hz);
    } else {
      sbuf_t b = { 0 };
      sb_add(&b, "[");
      for (int i = 0; i < got; i++) sb_printf(&b, "%s%d", i ? "," : "", rd[i]);
      sb_add(&b, "]");
      json = b.s;
    }
  }
  bus_finish(bus, start, end, (uint64_t)(d->nbytes + d->nread + 2), !ok);
  kernel_settle_at(d->w, d->epoch, d->promise, ok, json, end);
  free(d->bytes);
}

void bus_run_epd(deferred_t *d, vtime_t at) {
  handle_t *h = handle_find(d->handle), *fb = handle_find(d->fb);
  dmabuf_t *b = handle_buf(fb);
  int bus = h ? h->bus : 1;
  vtime_t start = bus_start(bus, at);
  if (!b) { kernel_settle_at(d->w, d->epoch, d->promise, 0, xstrdup("\"the framebuffer went away before the update\""), start); return; }
  vtime_t took = epd_update(b->front, b->w, d->x, d->y, d->wd, d->ht, d->op, start);
  vtime_t end = start + took;
  bus_finish(bus, start, end, (uint64_t)d->wd * d->ht, false);
  char j[64];
  snprintf(j, sizeof j, "{\"ms\":%.1f}", took / 1000.0);
  kernel_settle_at(d->w, d->epoch, d->promise, 1, xstrdup(j), end);
}

// the PaperS3 has no SPI panel; hw.c's SPI operations fail here
static void no_spi(deferred_t *d, vtime_t at) { kernel_settle_at(d->w, d->epoch, d->promise, 0, xstrdup("\"this board has no spi bus\""), at); free(d->bytes); }
void bus_run_spi_cmd(deferred_t *d, vtime_t at) { no_spi(d, at); }
void bus_run_spi_pixels(deferred_t *d, vtime_t at) { d->bytes = NULL; no_spi(d, at); }
