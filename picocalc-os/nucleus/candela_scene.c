#include "candela_scene.h"

enum {
    MAGIC = 0x4341, VERSION = 1,
    NODES = 8, MATERIALS = 264, SPHERES = 280, PARAMETERS = 295,
    NODE_LIMIT = 64, MATERIAL_LIMIT = 16, PARAMETER_LIMIT = 8,
    COLOR = 1, PARAM, MIX, CHECKER, POSITION, SCALE, FRACT, TILEMASK,
};

enum kind { RGB = 1, SCALAR, VEC2 };

static bool has_kind(const enum kind *types, unsigned count, uint16_t handle, enum kind expected) {
    return handle < count && types[handle] == expected;
}

static raytrace_demo_object sphere_at(const uint16_t *cells, unsigned i) {
    const uint16_t *at = cells + SPHERES + i * 5;
    return (raytrace_demo_object){.x=at[0], .y=at[1], .z=at[2], .radius=at[3], .material=at[4]};
}

bool candela_validate(const candela_graph *graph) {
    if (!graph || graph->capacity < CANDELA_GRAPH_CELLS) return false;
    const uint16_t *cells = graph->cells;
    const unsigned nodes = cells[2], materials = cells[3], spheres = cells[4], params = cells[5];
    if (cells[0] != MAGIC || cells[1] != VERSION || cells[7] != 0 ||
        nodes > NODE_LIMIT || materials > MATERIAL_LIMIT || spheres > RAYTRACE_DEMO_MAX_SPHERES ||
        params > PARAMETER_LIMIT || cells[6] >= materials) return false;

    for (unsigned i = 0; i < params; ++i)
        if (cells[PARAMETERS + i] > 256) return false;

    enum kind types[NODE_LIMIT];
    for (unsigned i = 0; i < nodes; ++i) {
        const uint16_t *desc = cells + NODES + 4 * i;
        const uint16_t a = desc[1], b = desc[2], c = desc[3];
        switch (desc[0]) {
        case COLOR:
            if (a > 255 || b > 255 || c > 255) return false;
            types[i] = RGB;
            break;
        case PARAM:
            if (a >= params || b != 0 || c != 0) return false;
            types[i] = SCALAR;
            break;
        case MIX:
            if (!has_kind(types, i, a, RGB) || !has_kind(types, i, b, RGB) ||
                !has_kind(types, i, c, SCALAR)) return false;
            types[i] = RGB;
            break;
        case CHECKER:
            if (!has_kind(types, i, a, RGB) || !has_kind(types, i, b, RGB) || c == 0) return false;
            types[i] = RGB;
            break;
        case POSITION:
            if (a != 0 || b != 0 || c != 0) return false;
            types[i] = VEC2;
            break;
        case SCALE:
            if (!has_kind(types, i, a, VEC2) || !has_kind(types, i, b, SCALAR) || c != 0) return false;
            types[i] = VEC2;
            break;
        case FRACT:
        case TILEMASK:
            if (!has_kind(types, i, a, VEC2) || b != 0 || c != 0) return false;
            types[i] = desc[0] == FRACT ? VEC2 : SCALAR;
            break;
        default:
            return false;
        }
    }

    for (unsigned i = 0; i < materials; ++i)
        if (!has_kind(types, nodes, cells[MATERIALS + i], RGB)) return false;
    for (unsigned i = 0; i < spheres; ++i) {
        const raytrace_demo_object object = sphere_at(cells, i);
        if (!raytrace_demo_object_fits(&object) || object.material >= materials) return false;
    }
    return true;
}

typedef struct { uint32_t capacity; uint16_t cells[CANDELA_WORK_CELLS]; } work_buffer;
typedef struct { uint32_t capacity; uint16_t cells[CANDELA_ROW_MATERIAL_CELLS]; } material_buffer;
typedef struct { uint32_t capacity; uint16_t cells[CANDELA_ROW_COLOR_CELLS]; } color_buffer;

_Static_assert(offsetof(candela_graph, cells) == 4, "Typed buffer payload offset");

typedef struct {
    const candela_graph *graph;
    const candela_shader *shader;
    candela_shade_mode mode;
    work_buffer work;
} shader_context;

static bool sample(void *userdata, int y, const uint16_t *materials, uint16_t *colors) {
    shader_context *ctx = userdata;
    if (ctx->mode == CANDELA_SHADE_SCALAR) {
        for (int x = 0; x < RAYTRACE_DEMO_SIDE; ++x) {
            const int32_t rgb = ctx->shader->color_at(ctx->graph, &ctx->work, materials[x], x, y);
            if (rgb < 0 || rgb > 0xffffff) return false;
            colors[2*x] = (uint16_t)(rgb >> 8);
            colors[2*x+1] = (uint16_t)(rgb & 255);
        }
        return true;
    }
    material_buffer row = {.capacity=CANDELA_ROW_MATERIAL_CELLS};
    color_buffer out = {.capacity=CANDELA_ROW_COLOR_CELLS};
    for (int x = 0; x < CANDELA_ROW_MATERIAL_CELLS; ++x) row.cells[x] = materials[x];
    if (ctx->shader->shade_row(ctx->graph, &ctx->work, &row, y, &out) != RAYTRACE_DEMO_SIDE) return false;
    for (int x = 0; x < CANDELA_ROW_COLOR_CELLS; ++x) colors[x] = out.cells[x];
    return true;
}

bool candela_render(uint16_t *pixels, size_t stride_pixels, const candela_graph *graph,
                    int light_x, int light_y, raytrace_demo_mode geometry,
                    candela_shade_mode mode, const candela_shader *shader,
                    raytrace_demo_stats *stats) {
    if (!shader || !candela_validate(graph)) return false;
    if ((mode != CANDELA_SHADE_SCALAR && mode != CANDELA_SHADE_ROW) ||
        (mode == CANDELA_SHADE_SCALAR && !shader->color_at) ||
        (mode == CANDELA_SHADE_ROW && !shader->shade_row)) return false;

    raytrace_demo_object objects[RAYTRACE_DEMO_MAX_SPHERES];
    const unsigned count = graph->cells[4];
    for (unsigned i = 0; i < count; ++i) objects[i] = sphere_at(graph->cells, i);
    shader_context context = {.graph=graph, .shader=shader, .mode=mode, .work={.capacity=CANDELA_WORK_CELLS}};
    return raytrace_demo_render_materials(pixels, stride_pixels, objects, count, graph->cells[6],
        light_x, light_y, geometry, sample, &context, stats);
}
