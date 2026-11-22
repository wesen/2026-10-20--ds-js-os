#include "raytrace_demo.h"

#include <stdlib.h>
#include <string.h>

#ifdef ESP_PLATFORM
#include "sdkconfig.h"
#endif

#if defined(CONFIG_IDF_TARGET_ESP32P4) || defined(RAYTRACE_DEMO_TEST_PIE)
#define RAYTRACE_PIE 1
void raytrace_demo_pie_row(const int16_t *x_squared, const int16_t *row_term,
                           int16_t *discriminants, size_t groups);
#else
#define RAYTRACE_PIE 0
#endif

enum { SIDE = RAYTRACE_DEMO_SIDE, SPHERES = RAYTRACE_DEMO_MAX_SPHERES, LANES = 8, MAX_RADIUS = 32, FLOOR_Z = 156 };

typedef struct {
    int x, y, z, radius;
    int red, green, blue;
} sphere;

typedef struct {
    sphere objects[SPHERES];
    size_t object_count;
    _Alignas(16) int16_t x_squared[SPHERES][SIDE];
    _Alignas(16) int16_t discriminants[SIDE];
    uint8_t roots[MAX_RADIUS * MAX_RADIUS + 1];
    int16_t depth[SIDE];
    uint8_t object_index[SIDE];
} trace;

typedef struct {
    int x, y, norm_squared, norm;
    int projected_x[SPHERES], projected_y[SPHERES];
    int reach_x[SPHERES], reach_y[SPHERES];
} light;

_Static_assert(SIDE % LANES == 0, "packed rows need complete groups");
_Static_assert(2 * 127 * 127 < INT16_MAX, "the largest squared distance fits PIE lanes");

raytrace_demo_scene raytrace_demo_default_scene(void) {
    return (raytrace_demo_scene){.sphere_x = 68, .sphere_y = 61, .light_x = 31, .light_y = 25};
}

bool raytrace_demo_has_pie(void) {
    return RAYTRACE_PIE;
}

static bool valid_output(const void *output, size_t stride, int light_x, int light_y,
                         raytrace_demo_mode mode) {
    return output && (uintptr_t)output % _Alignof(uint16_t) == 0 &&
           stride >= SIDE && stride <= (SIZE_MAX / sizeof(uint16_t) - SIDE) / (SIDE - 1) &&
           light_x >= 0 && light_x < SIDE && light_y >= 0 && light_y < SIDE &&
           (mode == RAYTRACE_DEMO_SCALAR || (mode == RAYTRACE_DEMO_PIE && RAYTRACE_PIE));
}

static bool valid(const void *output, size_t stride, const raytrace_demo_scene *scene,
                  raytrace_demo_mode mode) {
    return scene && scene->sphere_x >= RAYTRACE_DEMO_SPHERE_MIN &&
           scene->sphere_x <= RAYTRACE_DEMO_SPHERE_MAX &&
           scene->sphere_y >= RAYTRACE_DEMO_SPHERE_MIN &&
           scene->sphere_y <= RAYTRACE_DEMO_SPHERE_MAX &&
           valid_output(output, stride, scene->light_x, scene->light_y, mode);
}

bool raytrace_demo_object_fits(const raytrace_demo_object *object) {
    return object && object->x >= RAYTRACE_DEMO_SPHERE_MIN && object->x <= RAYTRACE_DEMO_SPHERE_MAX &&
           object->y >= RAYTRACE_DEMO_SPHERE_MIN && object->y <= RAYTRACE_DEMO_SPHERE_MAX &&
           object->radius >= 1 && object->radius <= MAX_RADIUS &&
           object->z > object->radius && object->z < FLOOR_Z - object->radius;
}

static void prepare_tables(trace *work) {
    for (size_t s = 0; s < work->object_count; ++s) {
        for (int x = 0; x < SIDE; ++x) {
            const int dx = x - work->objects[s].x;
            work->x_squared[s][x] = (int16_t)(dx * dx);
        }
    }
    int root = 0, next_square = 1;
    for (int i = 0; i <= MAX_RADIUS * MAX_RADIUS; ++i) {
        if (i == next_square) {
            ++root;
            next_square += 2 * root + 1;
        }
        work->roots[i] = (uint8_t)root;
    }
}

static void prepare_objects(trace *work, const raytrace_demo_scene *scene) {
    work->object_count = SPHERES;
    work->objects[0] = (sphere){scene->sphere_x, scene->sphere_y, 56, 26, 245, 83, 67};
    work->objects[1] = (sphere){100, 65, 105, 32, 48, 197, 213};
    work->objects[2] = (sphere){58, 109, 86, 23, 245, 182, 58};
}

static void prepare(trace *work, const raytrace_demo_scene *scene) {
    prepare_objects(work, scene);
    prepare_tables(work);
}

static unsigned trace_row(trace *work, int y, raytrace_demo_mode mode, bool count_hits) {
    memset(work->depth, 0, sizeof(work->depth));
    unsigned hits = 0;
    for (size_t s = 0; s < work->object_count; ++s) {
        const sphere *object = &work->objects[s];
        const int dy = y - object->y;
        const int16_t row_term = (int16_t)(object->radius * object->radius - dy * dy);
#if RAYTRACE_PIE
        if (mode == RAYTRACE_DEMO_PIE) {
            raytrace_demo_pie_row(work->x_squared[s], &row_term, work->discriminants, SIDE / LANES);
        } else
#else
        (void)mode;
#endif
        {
            for (int x = 0; x < SIDE; ++x)
                work->discriminants[x] = (int16_t)(row_term - work->x_squared[s][x]);
        }
        for (int x = 0; x < SIDE; ++x) {
            const int d = work->discriminants[x];
            if (d < 0) continue;
            hits += count_hits;
            const int16_t depth = (int16_t)(object->z - work->roots[d]);
            if (work->depth[x] == 0 || depth < work->depth[x]) {
                work->depth[x] = depth;
                work->object_index[x] = (uint8_t)s;
            }
        }
    }
    return hits;
}

static light prepare_light(const trace *work, int light_x, int light_y) {
    light lamp = {
        .x = (light_x - SIDE / 2) * 3 / 10,
        .y = (light_y - SIDE / 2) * 3 / 10,
    };
    lamp.norm_squared = lamp.x * lamp.x + lamp.y * lamp.y + 32 * 32;
    lamp.norm = 32;
    while ((lamp.norm + 1) * (lamp.norm + 1) <= lamp.norm_squared) ++lamp.norm;

    for (size_t s = 0; s < work->object_count; ++s) {
        const sphere *object = &work->objects[s];
        const int dz = FLOOR_Z - object->z;
        lamp.projected_x[s] = 32 * object->x - dz * lamp.x;
        lamp.projected_y[s] = 32 * object->y - dz * lamp.y;
        // Radius times the L1 bound on the projection's per-axis expansion.
        lamp.reach_x[s] = object->radius * (32 + abs(lamp.x));
        lamp.reach_y[s] = object->radius * (32 + abs(lamp.y));
    }
    return lamp;
}

static bool in_shadow(const trace *work, const light *lamp, int x, int y) {
    for (size_t s = 0; s < work->object_count; ++s) {
        if (abs(32 * x - lamp->projected_x[s]) > lamp->reach_x[s] ||
            abs(32 * y - lamp->projected_y[s]) > lamp->reach_y[s]) continue;

        const sphere *object = &work->objects[s];
        const int dx = object->x - x, dy = object->y - y, dz = FLOOR_Z - object->z;
        const int dot = dx * lamp->x + dy * lamp->y + 32 * dz;
        const int distance = dx * dx + dy * dy + dz * dz - object->radius * object->radius;
        // Exact ray-sphere intersection for a ray from the plane toward the lamp.
        if (dot > 0 && distance * lamp->norm_squared <= dot * dot) return true;
    }
    return false;
}

static uint16_t rgb565(int red, int green, int blue, int scale) {
    const int r = red * scale / 255;
    const int g = green * scale / 255;
    const int b = blue * scale / 255;
    return (uint16_t)(((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3));
}

static int sphere_scale(const sphere *object, const light *lamp, int depth, int x, int y) {
    const int height = object->z - depth;
    const int dot = (x - object->x) * lamp->x + (y - object->y) * lamp->y + 32 * height;
    const int bound = object->radius * lamp->norm;
    const int lit = dot <= 0 ? 0 : dot >= bound ? 183 : dot * 183 / bound;
    return 62 + lit;
}

static uint16_t shade_sphere(const trace *work, const light *lamp, int x, int y) {
    const sphere *object = &work->objects[work->object_index[x]];
    return rgb565(object->red, object->green, object->blue, sphere_scale(object, lamp, work->depth[x], x, y));
}

static uint16_t shade_floor(int x, int y, bool shadow) {
    const int checker = ((x / 16) ^ (y / 16)) & 1;
    const int level = checker ? 177 : 117;
    return rgb565(105, 134, 158, shadow ? level / 3 : level);
}

static void start_stats(raytrace_demo_stats *stats, raytrace_demo_mode mode, size_t object_count) {
    *stats = (raytrace_demo_stats){
        .rays = SIDE * SIDE,
        .sphere_tests = (uint32_t)(SIDE * SIDE * object_count),
        .pie_groups = mode == RAYTRACE_DEMO_PIE ? (uint32_t)(SIDE * SIDE * object_count / LANES) : 0,
        .checksum = UINT32_C(2166136261),
    };
}

static void hash_pixel(raytrace_demo_stats *stats, uint16_t pixel) {
    stats->checksum = (stats->checksum ^ (pixel & 255)) * UINT32_C(16777619);
    stats->checksum = (stats->checksum ^ (pixel >> 8)) * UINT32_C(16777619);
}

bool raytrace_demo_render(uint16_t *pixels, size_t stride_pixels, const raytrace_demo_scene *scene,
                          raytrace_demo_mode mode, raytrace_demo_stats *stats) {
    if (!valid(pixels, stride_pixels, scene, mode)) return false;

    trace work;
    prepare(&work, scene);
    const light lamp = prepare_light(&work, scene->light_x, scene->light_y);
    if (stats) start_stats(stats, mode, work.object_count);

    for (int y = 0; y < SIDE; ++y) {
        const unsigned hits = trace_row(&work, y, mode, stats != NULL);
        uint16_t *row = pixels + (size_t)y * stride_pixels;
        if (stats) stats->sphere_hits += hits;
        for (int x = 0; x < SIDE; ++x) {
            const bool hit = work.depth[x] != 0;
            const bool shadow = !hit && in_shadow(&work, &lamp, x, y);
            const uint16_t pixel = hit ? shade_sphere(&work, &lamp, x, y) : shade_floor(x, y, shadow);
            row[x] = pixel;
            if (stats) {
                stats->hit_pixels += hit;
                stats->shadow_pixels += shadow;
                hash_pixel(stats, pixel);
            }
        }
    }
    if (stats && mode == RAYTRACE_DEMO_PIE) stats->pie_active_lanes = stats->sphere_hits;
    return true;
}

bool raytrace_demo_intersections(int16_t *depth, size_t stride_pixels, const raytrace_demo_scene *scene,
                                 raytrace_demo_mode mode, raytrace_demo_stats *stats) {
    if (!valid(depth, stride_pixels, scene, mode)) return false;

    trace work;
    prepare(&work, scene);
    if (stats) start_stats(stats, mode, work.object_count);
    for (int y = 0; y < SIDE; ++y) {
        const unsigned hits = trace_row(&work, y, mode, stats != NULL);
        memcpy(depth + (size_t)y * stride_pixels, work.depth, sizeof(work.depth));
        if (stats) {
            stats->sphere_hits += hits;
            for (int x = 0; x < SIDE; ++x) {
                stats->hit_pixels += work.depth[x] != 0;
                hash_pixel(stats, (uint16_t)work.depth[x]);
            }
        }
    }
    if (stats && mode == RAYTRACE_DEMO_PIE) stats->pie_active_lanes = stats->sphere_hits;
    return true;
}

static void save_audit(const trace *work, int16_t *depth, uint16_t *ids) {
    memcpy(depth, work->depth, sizeof(work->depth));
    for (int x = 0; x < SIDE; ++x)
        ids[x] = work->depth[x] ? (uint16_t)(work->object_index[x] + 1) : 0;
}

bool raytrace_demo_render_audit(uint16_t *pixels, int16_t *depth, uint16_t *ids,
                                size_t stride_pixels, const raytrace_demo_scene *scene,
                                raytrace_demo_mode mode) {
    if (!valid(pixels, stride_pixels, scene, mode) || !valid(depth, stride_pixels, scene, mode) ||
        !valid(ids, stride_pixels, scene, mode)) return false;
    trace work;
    prepare(&work, scene);
    const light lamp = prepare_light(&work, scene->light_x, scene->light_y);
    for (int y = 0; y < SIDE; ++y) {
        const size_t row = (size_t)y * stride_pixels;
        trace_row(&work, y, mode, false);
        save_audit(&work, depth + row, ids + row);
        for (int x = 0; x < SIDE; ++x)
            pixels[row + x] = work.depth[x] ? shade_sphere(&work, &lamp, x, y) :
                shade_floor(x, y, in_shadow(&work, &lamp, x, y));
    }
    return true;
}

bool raytrace_demo_trace_audit(int16_t *depth, uint16_t *ids, size_t stride_pixels,
                               const raytrace_demo_scene *scene, raytrace_demo_mode mode) {
    if (!valid(depth, stride_pixels, scene, mode) || !valid(ids, stride_pixels, scene, mode))
        return false;
    trace work;
    prepare(&work, scene);
    for (int y = 0; y < SIDE; ++y) {
        const size_t row = (size_t)y * stride_pixels;
        trace_row(&work, y, mode, false);
        save_audit(&work, depth + row, ids + row);
    }
    return true;
}

bool raytrace_demo_shade_audit(uint16_t *pixels, const int16_t *depth, const uint16_t *ids,
                               size_t stride_pixels, const raytrace_demo_scene *scene) {
    if (!valid(pixels, stride_pixels, scene, RAYTRACE_DEMO_SCALAR) ||
        !valid(depth, stride_pixels, scene, RAYTRACE_DEMO_SCALAR) ||
        !valid(ids, stride_pixels, scene, RAYTRACE_DEMO_SCALAR)) return false;
    trace work;
    prepare_objects(&work, scene);
    const light lamp = prepare_light(&work, scene->light_x, scene->light_y);
    for (int y = 0; y < SIDE; ++y) {
        const size_t row = (size_t)y * stride_pixels;
        for (int x = 0; x < SIDE; ++x) {
            const uint16_t id = ids[row + x];
            const int z = depth[row + x];
            if (id > SPHERES || z < 0 || z > 105 || (id == 0) != (z == 0)) return false;
            if (id == 0) {
                pixels[row + x] = shade_floor(x, y, in_shadow(&work, &lamp, x, y));
            } else {
                const sphere *object = &work.objects[id - 1];
                pixels[row + x] = rgb565(object->red, object->green, object->blue,
                    sphere_scale(object, &lamp, z, x, y));
            }
        }
    }
    return true;
}

bool raytrace_demo_render_materials(uint16_t *pixels, size_t stride_pixels,
                                  const raytrace_demo_object *objects, size_t object_count,
                                  uint16_t floor_material, int light_x, int light_y,
                                  raytrace_demo_mode mode, raytrace_demo_material_row sample,
                                  void *context, raytrace_demo_stats *stats) {
    if (!sample || !objects || object_count > SPHERES ||
        !valid_output(pixels, stride_pixels, light_x, light_y, mode)) return false;
    trace work;
    work.object_count = object_count;
    for (size_t s = 0; s < object_count; ++s) {
        const raytrace_demo_object *object = &objects[s];
        if (!raytrace_demo_object_fits(object)) return false;
        work.objects[s] = (sphere){.x=object->x, .y=object->y, .z=object->z, .radius=object->radius};
    }
    prepare_tables(&work);
    const light lamp = prepare_light(&work, light_x, light_y);
    uint16_t materials[SIDE], colors[2 * SIDE];
    if (stats) start_stats(stats, mode, work.object_count);
    for (int y = 0; y < SIDE; ++y) {
        const unsigned hits = trace_row(&work, y, mode, stats != NULL);
        uint16_t *row = pixels + (size_t)y * stride_pixels;
        for (int x = 0; x < SIDE; ++x)
            materials[x] = work.depth[x] != 0 ? objects[work.object_index[x]].material : floor_material;
        if (!sample(context, y, materials, colors)) return false;
        if (stats) stats->sphere_hits += hits;
        for (int x = 0; x < SIDE; ++x) {
            const bool hit = work.depth[x] != 0;
            const bool shadow = !hit && in_shadow(&work, &lamp, x, y);
            const int scale = hit ? sphere_scale(&work.objects[work.object_index[x]], &lamp, work.depth[x], x, y) :
                shadow ? 85 : 255;
            const uint16_t rg = colors[2*x], b = colors[2*x+1];
            row[x] = rgb565(rg >> 8, rg & 255, b, scale);
            if (stats) {
                stats->hit_pixels += hit;
                stats->shadow_pixels += shadow;
                hash_pixel(stats, row[x]);
            }
        }
    }
    if (stats && mode == RAYTRACE_DEMO_PIE) stats->pie_active_lanes = stats->sphere_hits;
    return true;
}
