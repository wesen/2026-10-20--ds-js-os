#pragma once

#include "raytrace_demo.h"

enum {
    CANDELA_GRAPH_CELLS = 303,
    CANDELA_WORK_CELLS = 192,
    CANDELA_ROW_MATERIAL_CELLS = RAYTRACE_DEMO_SIDE,
    CANDELA_ROW_COLOR_CELLS = 2 * RAYTRACE_DEMO_SIDE,
};

// Typed buffer ABI. The caller always supplies storage for all fixed cells.
typedef struct {
    uint32_t capacity;
    uint16_t cells[CANDELA_GRAPH_CELLS];
} candela_graph;

typedef enum {
    CANDELA_SHADE_SCALAR,
    CANDELA_SHADE_ROW,
} candela_shade_mode;

typedef struct {
    int32_t (*color_at)(const candela_graph *graph, void *work,
                        int32_t material, int32_t x, int32_t y);
    int32_t (*shade_row)(const candela_graph *graph, void *work, const void *materials,
                         int32_t y, void *out);
} candela_shader;

bool candela_validate(const candela_graph *graph);

// The graph is read-only during a draw. Invalid descriptors are rejected
// before writing any output. A failing shader may leave earlier rows drawn.
bool candela_render(uint16_t *pixels, size_t stride_pixels, const candela_graph *graph,
                    int light_x, int light_y, raytrace_demo_mode geometry,
                    candela_shade_mode mode, const candela_shader *shader,
                    raytrace_demo_stats *stats);
