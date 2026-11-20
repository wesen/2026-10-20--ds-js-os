#pragma once
#include "painter_commands.h"

enum { full_width = 320, full_height = 320, pixel_count = full_width * full_height };

typedef void (*raster_fn)(dmabuf_t *, const uint16_t *, size_t);
void raster_draw_edges(dmabuf_t *, const uint16_t *, size_t);
void raster_draw_scalar(dmabuf_t *, const uint16_t *, size_t);
void raster_draw_pie(dmabuf_t *, const uint16_t *, size_t);

static const raster_fn renderers[] = {
    painter_commands_draw, raster_draw_edges, raster_draw_scalar, raster_draw_pie,
};
static const char *const arm_names[] = {"stock", "edges", "scalar", "pie"};
enum { arms = sizeof(renderers) / sizeof(renderers[0]) };

static inline dmabuf_t raster_buffer(pixel_t *pixels) {
    return (dmabuf_t){.w = full_width, .h = full_height, .bytes = pixel_count * sizeof(*pixels),
                      .back = pixels, .dirty = UINT64_C(1) << 31};
}
