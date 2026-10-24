// Hardware handles. A JS driver asks for a bus device by claim ("i2c0:0x1f", "spi2"); if the manifest
// gave its world that claim, it gets a handle: an unforgeable number the kernel checks on every use.
// A handle can be narrowed (attenuated) to fewer rights, passed to another world inside a message, and
// revoked by the world that made it. Bus transfers are asynchronous: they start when the issuing turn
// ends and the bus is free, take the time the bytes take on the wire, and settle a promise when done.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"

void kernel_settle_at(int w, int epoch, int promise, int ok, char *json, vtime_t t);

static handle_t *find(int id) {
  for (int i = 0; i < MAX_HANDLES; i++) if (K.handles[i].live && K.handles[i].id == id) return &K.handles[i];
  return NULL;
}
static uint64_t bit(world_t *W) { return 1ull << W->id; }
bool world_holds(world_t *W, int id) { handle_t *h = find(id); return h && (h->holders & bit(W)); }

handle_t *handle_new(int type, world_t *holder, const char *claim) {
  for (int i = 0; i < MAX_HANDLES; i++) {
    handle_t *h = &K.handles[i];
    if (h->live) continue;
    memset(h, 0, sizeof(*h));
    h->live = true; h->id = ++K.n_handles; h->type = type; h->rights = R_READ | R_WRITE | R_GRANT;
    h->minter = holder->id; h->holders = bit(holder); h->buf = -1;
    snprintf(h->claim, sizeof(h->claim), "%s", claim ? claim : "");
    return h;
  }
  return NULL;
}

static bool revoked(handle_t *h) {
  for (int depth = 0; h && depth < 32; depth++) {
    if (h->revoked) return true;
    h = h->parent ? find(h->parent) : NULL;
  }
  return false;
}

static const char *type_name(int t) { return t == H_I2C ? "i2c" : t == H_SPI ? "spi" : "dma"; }

handle_t *handle_use(world_t *W, int id, int type, int right, char *err, size_t n) {
  handle_t *h = find(id);
  if (!h) { snprintf(err, n, "there is no handle %d", id); return NULL; }
  if (!(h->holders & bit(W))) { snprintf(err, n, "%s does not hold handle %d", W->name, id); return NULL; }
  if (revoked(h)) { snprintf(err, n, "handle %d was revoked", id); return NULL; }
  if (type >= 0 && h->type != type) { snprintf(err, n, "handle %d is a %s handle, not %s", id, type_name(h->type), type_name(type)); return NULL; }
  if ((h->rights & right) != right) {
    snprintf(err, n, "handle %d is %s", id, (right & R_WRITE) ? "read-only" : (right & R_GRANT) ? "not grantable" : "write-only");
    return NULL;
  }
  return h;
}

handle_t *handle_child(world_t *W, handle_t *p, int rights) {
  handle_t *h = handle_new(p->type, W, p->claim);
  if (!h) return NULL;
  h->rights = p->rights & rights; h->parent = p->id;
  h->bus = p->bus; h->addr = p->addr; h->hz = p->hz; h->buf = p->buf;
  if (h->buf >= 0) K.bufs[h->buf].refs++;
  return h;
}

void handle_grant(handle_t *h, world_t *to) { h->holders |= bit(to); }

static void buf_unref(int i) {
  if (i < 0) return;
  dmabuf_t *b = &K.bufs[i];
  if (--b->refs > 0) return;
  free(b->back); free(b->front);
  memset(b, 0, sizeof(*b));
}

void handle_release(handle_t *h, world_t *W) {
  h->holders &= ~bit(W);
  if (h->holders) return;
  buf_unref(h->buf);
  h->live = false;
}

void handles_drop_world(world_t *W) {
  for (int i = 0; i < MAX_HANDLES; i++) if (K.handles[i].live && (K.handles[i].holders & bit(W))) handle_release(&K.handles[i], W);
}

int dmabuf_alloc(int w, int h) {
  for (int i = 0; i < MAX_BUFS; i++) {
    dmabuf_t *b = &K.bufs[i];
    if (b->live) continue;
    b->live = true; b->refs = 1; b->w = w; b->h = h;
    b->bytes = (size_t)w * h * 2;
    b->back = calloc((size_t)w * h, 2);
    b->front = calloc((size_t)w * h, 2);
    for (size_t k = 0; k < (size_t)w * h; k++) b->front[k] = 0x0821;   // differs from anything drawn: the first commit sends everything
    return i;
  }
  return -1;
}
dmabuf_t *handle_buf(handle_t *h) { return h && h->buf >= 0 && K.bufs[h->buf].live ? &K.bufs[h->buf] : NULL; }

// ---- buses --------------------------------------------------------------------------------------------------
static vtime_t wire_us(double bits, int hz) { return (vtime_t)(bits * 1e6 / (hz > 0 ? hz : 1) + 0.5); }

static vtime_t bus_start(int bus, vtime_t at) {
  bus_t *b = &K.buses[bus];
  return at > b->free_at ? at : b->free_at;
}
static void bus_finish(int bus, vtime_t start, vtime_t end, uint64_t bytes, bool error) {
  bus_t *b = &K.buses[bus];
  b->free_at = end; b->busy_us += end - start; b->bytes += bytes; b->transfers++;
  if (error) b->errors++;
}

static void run_i2c(deferred_t *d, vtime_t at) {
  handle_t *h = find(d->handle);
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

void hw_i2c(world_t *W, handle_t *h, const uint8_t *wr, int nwr, int nrd, vtime_t gap, int promise) {
  deferred_t *d = calloc(1, sizeof(*d));
  d->delay = gap;
  d->run = run_i2c; d->w = W->id; d->epoch = W->epoch; d->promise = promise; d->handle = h->id;
  d->bytes = malloc((size_t)nwr + 1); memcpy(d->bytes, wr, (size_t)nwr); d->nbytes = nwr; d->nread = nrd;
  defer(d);
}

static void run_spi_cmd(deferred_t *d, vtime_t at) {
  handle_t *h = find(d->handle);
  int hz = h ? h->hz : 1000000;
  vtime_t start = bus_start(BUS_SPI2, at);
  st7365p_cmd((uint8_t)d->op, start);
  if (d->nbytes) st7365p_data(d->bytes, d->nbytes, start + wire_us(8, hz));
  vtime_t end = start + wire_us((1 + d->nbytes) * 8.0, hz) + 2;   // + chip-select and D/C toggling
  bus_finish(BUS_SPI2, start, end, (uint64_t)(1 + d->nbytes), false);
  kernel_settle_at(d->w, d->epoch, d->promise, 1, NULL, end);
  free(d->bytes);
}

void hw_spi_cmd(world_t *W, handle_t *h, int cmd, const uint8_t *data, int n, int promise) {
  deferred_t *d = calloc(1, sizeof(*d));
  d->run = run_spi_cmd; d->w = W->id; d->epoch = W->epoch; d->promise = promise; d->handle = h->id; d->op = cmd;
  d->bytes = malloc((size_t)n + 1); if (n) memcpy(d->bytes, data, (size_t)n); d->nbytes = n;
  defer(d);
}

static void run_spi_pixels(deferred_t *d, vtime_t at) {
  handle_t *h = find(d->handle), *fb = find(d->fb);
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

void hw_spi_pixels(world_t *W, handle_t *h, handle_t *fb, int x, int y, int w, int hh, int promise) {
  deferred_t *d = calloc(1, sizeof(*d));
  d->run = run_spi_pixels; d->w = W->id; d->epoch = W->epoch; d->promise = promise; d->handle = h->id; d->fb = fb->id;
  d->x = x; d->y = y; d->wd = w; d->ht = hh;
  K.seg_cost += (vtime_t)((double)w * hh * PROFILE.fill_ns_per_px / 1000.0);   // queueing the DMA descriptors
  defer(d);
}

// ---- reports -----------------------------------------------------------------------------------------------
char *hw_handles_json(void) {
  sbuf_t b = { 0 };
  sb_add(&b, "[");
  int n = 0;
  for (int i = 0; i < MAX_HANDLES; i++) {
    handle_t *h = &K.handles[i];
    if (!h->live) continue;
    sb_printf(&b, "%s{\"id\":%d,\"type\":\"%s\",\"claim\":", n++ ? "," : "", h->id, type_name(h->type));
    sb_json_str(&b, h->claim);
    sb_printf(&b, ",\"rights\":\"%s%s%s\",\"parent\":%d,\"revoked\":%s,\"holders\":[",
              h->rights & R_READ ? "r" : "", h->rights & R_WRITE ? "w" : "", h->rights & R_GRANT ? "g" : "",
              h->parent, revoked(h) ? "true" : "false");
    int m = 0;
    for (int w = 0; w < K.n_worlds; w++) if (h->holders & (1ull << K.worlds[w]->id)) { sb_add(&b, m++ ? "," : ""); sb_json_str(&b, K.worlds[w]->name); }
    sb_add(&b, "]");
    dmabuf_t *db = handle_buf(h);
    if (db) sb_printf(&b, ",\"w\":%d,\"h\":%d,\"kb\":%zu", db->w, db->h, db->bytes * 2 / 1024);
    if (h->type == H_I2C) sb_printf(&b, ",\"addr\":%d,\"hz\":%d", h->addr, h->hz);
    if (h->type == H_SPI) sb_printf(&b, ",\"hz\":%d", h->hz);
    sb_add(&b, "}");
  }
  sb_add(&b, "]");
  return b.s;
}

char *hw_buses_json(void) {
  sbuf_t b = { 0 };
  sb_add(&b, "[");
  for (int i = 0; i < N_BUSES; i++) {
    bus_t *u = &K.buses[i];
    sb_printf(&b, "%s{\"name\":\"%s\",\"busy_ms\":%.3f,\"bytes\":%llu,\"transfers\":%llu,\"errors\":%llu}", i ? "," : "",
              u->name, u->busy_us / 1000.0, (unsigned long long)u->bytes, (unsigned long long)u->transfers, (unsigned long long)u->errors);
  }
  sb_add(&b, "]");
  return b.s;
}
