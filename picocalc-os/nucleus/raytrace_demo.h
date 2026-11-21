#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define RAYTRACE_DEMO_SIDE 160
#define RAYTRACE_DEMO_SPHERE_MIN 32
#define RAYTRACE_DEMO_SPHERE_MAX 127

typedef enum {
    RAYTRACE_DEMO_SCALAR,
    RAYTRACE_DEMO_PIE,
} raytrace_demo_mode;

typedef struct {
    int sphere_x;
    int sphere_y;
    int light_x;
    int light_y;
} raytrace_demo_scene;

typedef struct {
    uint32_t rays;
    uint32_t sphere_tests;
    uint32_t sphere_hits;       // all primary sphere intersections, including occluded hits
    uint32_t hit_pixels;        // pixels where a sphere wins the depth test
    uint32_t shadow_pixels;     // visible checker plane pixels in shadow
    uint32_t pie_groups;
    uint32_t pie_active_lanes;  // packed sphere lanes with a nonnegative discriminant
    uint32_t checksum;          // FNV-1a of active pixels, low byte first
} raytrace_demo_stats;

enum { RAYTRACE_DEMO_MAX_SPHERES = 3 };

typedef struct {
    int x, y, z, radius;
    uint16_t material;
} raytrace_demo_object;

// The callback receives the winning material for each pixel. It writes two
// uint16_t cells per pixel, with R:G in the first and B in the second.
typedef bool (*raytrace_demo_material_row)(void *context, int y,
                                          const uint16_t *materials, uint16_t *colors);

raytrace_demo_scene raytrace_demo_default_scene(void);
bool raytrace_demo_has_pie(void);
bool raytrace_demo_object_fits(const raytrace_demo_object *object);

// Write 160 rows of 160 RGB565 pixels. The caller supplies storage and may pad
// each row. Sphere coordinates must be 32..127, light coordinates 0..159.
// Optional stats and the destination are unchanged on invalid input.
bool raytrace_demo_render(uint16_t *pixels, size_t stride_pixels,
                          const raytrace_demo_scene *scene, raytrace_demo_mode mode,
                          raytrace_demo_stats *stats);

// Run the same primary intersection and nearest-depth code, without shading.
// A miss writes zero. The depth checksum uses the same low-byte-first order.
bool raytrace_demo_intersections(int16_t *depth, size_t stride_pixels,
                                 const raytrace_demo_scene *scene, raytrace_demo_mode mode,
                                 raytrace_demo_stats *stats);

// Matched measurement paths. All planes have the same stride and different
// storage. A miss writes zero; sphere IDs are one-based in scene order.
bool raytrace_demo_render_audit(uint16_t *pixels, int16_t *depth, uint16_t *ids,
                                size_t stride_pixels, const raytrace_demo_scene *scene,
                                raytrace_demo_mode mode);
bool raytrace_demo_trace_audit(int16_t *depth, uint16_t *ids, size_t stride_pixels,
                               const raytrace_demo_scene *scene, raytrace_demo_mode mode);
// The audit inputs come from the same scene's trace. Malformed planes may
// cause an early return after preceding pixels have been drawn.
bool raytrace_demo_shade_audit(uint16_t *pixels, const int16_t *depth, const uint16_t *ids,
                               size_t stride_pixels, const raytrace_demo_scene *scene);

// Render already validated sphere geometry with an external material evaluator.
bool raytrace_demo_render_materials(uint16_t *pixels, size_t stride_pixels,
                                  const raytrace_demo_object *objects, size_t object_count,
                                  uint16_t floor_material, int light_x, int light_y,
                                  raytrace_demo_mode mode, raytrace_demo_material_row sample,
                                  void *context, raytrace_demo_stats *stats);
