#pragma once

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

static void triangle_half(dmabuf_t *buffer, raster_edge *long_edge,
                          raster_vertex a, raster_vertex b, pixel_t color) {
  if (a.y == b.y) return;
  raster_edge short_edge = edge_at(a, b, a.y);
  pixel_t *row = buffer->back + (size_t)(PAINTER_TOP + a.y) * PAINTER_WIDTH;
  uint32_t dirty = 0;
  const bool charge_spans = PROFILE.fill_ns_per_px != 2.5;
  for (int y = PAINTER_TOP + a.y; y < PAINTER_TOP + b.y; y++) {
    int x0 = long_edge->x, x1 = short_edge.x;
    int left = x0 < x1 ? x0 : x1;
    unsigned n = (unsigned)(x0 + x1 - 2 * left);
    if (n) {
      for (unsigned x = 0; x < n; x++) row[left + x] = color;
      dirty |= UINT32_C(1) << (y / 16);
      // No single span reaches the 400 pixels needed for a default tick.
      if (charge_spans) K.seg_cost += (vtime_t)((double)n * PROFILE.fill_ns_per_px / 1000.0);
    }
    step_edge(long_edge);
    step_edge(&short_edge);
    row += PAINTER_WIDTH;
  }
  buffer->dirty |= dirty;
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
