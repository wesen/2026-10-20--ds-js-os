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

raytrace_demo_scene raytrace_demo_default_scene(void);
bool raytrace_demo_has_pie(void);

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
