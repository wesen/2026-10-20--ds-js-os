// Used only for prevalidated vertices inside the 320 by 280 painter body.
typedef struct { int x, y; } raster_vertex;
typedef struct { int x, rem, denom, dx, dr; } raster_edge;

static inline void vertex_order(raster_vertex *a, raster_vertex *b) {
  if (a->y > b->y) {
    raster_vertex other = *a;
    *a = *b;
    *b = other;
  }
}

static raster_edge edge_at(raster_vertex a, raster_vertex b, int y) {
  int dy = b.y - a.y, d = 2 * dy, delta = b.x - a.x;
  int numerator = 2 * a.x * dy + (2 * (y - a.y) + 1) * delta - dy + d - 1;
  int x = numerator / d;
  int dx = 2 * delta / d;
  int dr = 2 * delta - dx * d;
  if (dr < 0) { dx--; dr += d; } // Normalize the slope's remainder.
  return (raster_edge){x, numerator - x * d, d, dx, dr};
}

static inline void step_edge(raster_edge *e) {
  e->x += e->dx;
  e->rem += e->dr;
  if (e->rem >= e->denom) {
    e->rem -= e->denom;
    e->x++;
  }
}

#if RASTER_ARM >= 2
#if RASTER_ARM == 3 && (defined(ESP_PLATFORM) || defined(RASTER_PIE_MODEL))
void raster_pie_groups(pixel_t *dst, unsigned groups, const pixel_t *color);
#endif

static inline void raster_write(pixel_t *dst, unsigned n, pixel_t color) {
#if RASTER_ARM == 3 && (defined(ESP_PLATFORM) || defined(RASTER_PIE_MODEL))
  if (n >= 16) {
    unsigned prefix = ((0u - (uintptr_t)dst) & 15u) / sizeof(*dst);
    n -= prefix;
    while (prefix--) *dst++ = color;
    unsigned groups = n / 8;
    raster_pie_groups(dst, groups, &color);
    dst += groups * 8;
    n %= 8;
  }
#endif
  while (n--) *dst++ = color;
}

static inline void raster_charge(unsigned pixels) {
  // Match gfx_fill's per-call rounding of virtual microseconds.
  if (PROFILE.fill_ns_per_px == 2.5)
    K.seg_cost += pixels / 400;
  else
    K.seg_cost += (vtime_t)((double)pixels * PROFILE.fill_ns_per_px / 1000.0);
}

static void painter_fill(dmabuf_t *buffer, int x, int y, unsigned w, unsigned h, pixel_t color) {
  uint64_t mask = ((UINT64_C(1) << ((y + h - 1) / 16 - y / 16 + 1)) - 1) << (y / 16);
  buffer->dirty |= mask;
  if (w == PAINTER_WIDTH) {
    raster_write(buffer->back + (size_t)y * PAINTER_WIDTH, w * h, color);
  } else {
    for (unsigned row = 0; row < h; row++)
      raster_write(buffer->back + ((size_t)y + row) * PAINTER_WIDTH + x, w, color);
  }
  raster_charge(w * h);
}
#endif

static void triangle_half(dmabuf_t *buffer, raster_edge *long_edge,
                          raster_vertex a, raster_vertex b, pixel_t color) {
  if (a.y == b.y) return;
  raster_edge short_edge = edge_at(a, b, a.y);
#if RASTER_ARM >= 2
  pixel_t *row = buffer->back + (size_t)(PAINTER_TOP + a.y) * PAINTER_WIDTH;
  uint32_t dirty = 0;
  const bool charge_spans = PROFILE.fill_ns_per_px != 2.5;
#endif
  for (int y = PAINTER_TOP + a.y; y < PAINTER_TOP + b.y; y++) {
    int x0 = long_edge->x, x1 = short_edge.x;
    int left = x0 < x1 ? x0 : x1;
    unsigned n = (unsigned)(x0 + x1 - 2 * left);
    if (n) {
#if RASTER_ARM == 1
      gfx_fill(buffer, left, y, n, 1, color);
#else
      raster_write(row + left, n, color);
      dirty |= UINT32_C(1) << (y / 16);
      // No single span reaches the 400 pixels needed for a default tick.
      if (charge_spans) K.seg_cost += (vtime_t)((double)n * PROFILE.fill_ns_per_px / 1000.0);
#endif
    }
    step_edge(long_edge);
    step_edge(&short_edge);
#if RASTER_ARM >= 2
    row += PAINTER_WIDTH;
#endif
  }
#if RASTER_ARM >= 2
  buffer->dirty |= dirty;
#endif
}

static void painter_triangle(dmabuf_t *buffer, const uint16_t *p) {
  raster_vertex a = {p[0], p[1]}, b = {p[2], p[3]}, c = {p[4], p[5]};
  vertex_order(&a, &b);
  vertex_order(&b, &c);
  vertex_order(&a, &b);
  if (a.y == c.y) return;
  raster_edge long_edge = edge_at(a, c, a.y);
  triangle_half(buffer, &long_edge, a, b, p[6]);
  triangle_half(buffer, &long_edge, b, c, p[6]);
}
