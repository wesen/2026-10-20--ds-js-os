// Release the fixture world's only framebuffer holder after the SPI request has been
// submitted and before the kernel can collect its completion. The bus owns the last ref.
#include <string.h>
#include "p4.h"

static int pinned = -1;
void __real_bus_run_spi_pixels(deferred_t *d, vtime_t at);
void __real_bus_p4_done(const kmsg_t *m);

void __wrap_bus_run_spi_pixels(deferred_t *d, vtime_t at) {
  __real_bus_run_spi_pixels(d, at);
  world_t *W = world_by_id(d->w);
  if (!W || strcmp(W->name, "fs-probe")) return;
  handle_t *h = handle_find(d->fb);
  if (!h || h->buf < 0) return;
  pinned = h->buf;
  handle_release(h, W);
  klog("PHASE3 DMA pinned %s", K.bufs[pinned].live && K.bufs[pinned].refs == 1 ? "true" : "false");
}

void __wrap_bus_p4_done(const kmsg_t *m) {
  bool probe = pinned >= 0 && m->buf == pinned;
  __real_bus_p4_done(m);
  if (probe) {
    klog("PHASE3 DMA completion %s", m->ok && !K.bufs[pinned].live ? "true" : "false");
    pinned = -1;
  }
}
