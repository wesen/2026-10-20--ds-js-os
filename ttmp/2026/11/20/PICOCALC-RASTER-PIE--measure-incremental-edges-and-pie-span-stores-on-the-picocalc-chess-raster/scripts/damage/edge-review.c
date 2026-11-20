/* Include the candidate directly so this checks the exact edge and span functions. */
#include "painter_commands.h"
#include <assert.h>
#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#define RASTER_ARM 3
#define RASTER_PIE_MODEL 1
#include "../edges.inc"

static unsigned calls, vectors;
void raster_pie_groups(pixel_t *dst, unsigned groups, const pixel_t *color) {
    assert(groups && ((uintptr_t)dst % 16) == 0 && ((uintptr_t)color % 2) == 0);
    ++calls;
    vectors += groups;
    for (unsigned i = 0; i < groups * 8; ++i) dst[i] = *color;
}

static int first(int ax, int dx, int dy, int row) {
    /* ceil((2X - 1)/2) with a positive denominator, correct on both sides of zero. */
    int64_t numerator = (int64_t)2 * ax * dy + (2 * row + 1) * dx - dy;
    return (int)(numerator / (2 * dy) + (numerator % (2 * dy) > 0));
}

int main(void) {
    uint64_t initial = 0, rows = 0, spans = 0, groups = 0;
    /* All x translations share the same fractional residual. Test both extremes. */
    for (int dy = 1; dy < PAINTER_HEIGHT; ++dy) {
        for (int dx = 1 - PAINTER_WIDTH; dx < PAINTER_WIDTH; ++dx) {
            int min_ax = dx < 0 ? -dx : 0;
            int max_ax = dx > 0 ? PAINTER_WIDTH - 1 - dx : PAINTER_WIDTH - 1;
            for (int position = 0; position < 2; ++position) {
                int ax = position ? max_ax : min_ax;
                int ay = position ? PAINTER_HEIGHT - 1 - dy : 0;
                raster_vertex a = {ax, ay}, b = {ax + dx, ay + dy};
                raster_edge edge = edge_at(a, b, ay);
                ++initial;
                for (int row = 0; row < dy; ++row) {
                    int x = first(ax, dx, dy, row);
                    assert(edge.x == x && x >= 0 && x < PAINTER_WIDTH);
                    assert(edge.rem >= 0 && edge.rem < edge.denom);
                    step_edge(&edge);
                    ++rows;
                }
            }
        }
    }
    _Alignas(16) pixel_t observed[PAINTER_WIDTH + 32], expected[PAINTER_WIDTH + 32];
    for (unsigned i = 0; i < 8; ++i) {
        unsigned offset = 8 + i;
        for (unsigned n = 0; n <= PAINTER_WIDTH; ++n) {
            memset(observed, 0x73, sizeof(observed));
            memcpy(expected, observed, sizeof(observed));
            for (unsigned j = 0; j < n; ++j) expected[offset + j] = 0xe38c;
            calls = vectors = 0;
            raster_write(observed + offset, n, 0xe38c);
            assert(memcmp(observed, expected, sizeof(observed)) == 0);
            unsigned prefix = (8 - i) % 8;
            assert(calls == (n >= 16));
            assert(vectors == (n >= 16 ? (n - prefix) / 8 : 0));
            ++spans;
            groups += vectors;
        }
    }
    printf("{\"edgeStarts\":%" PRIu64 ",\"edgeRows\":%" PRIu64 ",\"spanCases\":%" PRIu64
           ",\"modeledGroupStores\":%" PRIu64 "}\n", initial, rows, spans, groups);
}
