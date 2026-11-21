// One scalar/PIE pair per console command lets the kernel dispatch between pairs.
#include <errno.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "esp_heap_caps.h"
#include "esp_rom_crc.h"
#include "esp_timer.h"
#include "raytrace_demo.h"

enum { SIDE = RAYTRACE_DEMO_SIDE, BYTES = SIDE * SIDE * sizeof(uint16_t) };

typedef struct {
    int64_t scalar_us, pie_us;
    uint32_t crc;
    bool equal;
} sample;

static bool run_stage(uint16_t *pixels, const raytrace_demo_scene *scene, bool frame,
                      raytrace_demo_mode mode, raytrace_demo_stats *stats) {
    if (frame) return raytrace_demo_render(pixels, SIDE, scene, mode, stats);
    return raytrace_demo_intersections((int16_t *)pixels, SIDE, scene, mode, stats);
}

static bool sample_pair(uint16_t *pixels, uint16_t *first, const raytrace_demo_scene *scene,
                        bool frame, bool pie_first, sample *result) {
    // Both modes write to the identical PSRAM address. The first result copy and
    // checksum are outside the timed region. Different initial fills expose missing writes.
    for (int pass = 0; pass < 2; pass++) {
        bool use_pie = pass == 0 ? pie_first : !pie_first;
        raytrace_demo_mode mode = use_pie ? RAYTRACE_DEMO_PIE : RAYTRACE_DEMO_SCALAR;
        memset(pixels, pass ? 0x5a : 0xa5, BYTES);
        int64_t start = esp_timer_get_time();
        bool ok = run_stage(pixels, scene, frame, mode, NULL);
        int64_t elapsed = esp_timer_get_time() - start;
        if (!ok) return false;
        if (mode == RAYTRACE_DEMO_PIE) result->pie_us = elapsed;
        else result->scalar_us = elapsed;
        if (!pass) memcpy(first, pixels, BYTES);
    }
    result->equal = memcmp(first, pixels, BYTES) == 0;
    result->crc = esp_rom_crc32_le(0, (const uint8_t *)pixels, BYTES);
    return true;
}

void p4_raybench(const char *argument) {
    char *end;
    errno = 0;
    long block = strtol(argument, &end, 10);
    if (errno || *end || block < 0 || block >= 18) {
        puts("usage: raybench [0..17]");
        return;
    }
    if (!raytrace_demo_has_pie()) {
        puts("raybench: PIE unavailable");
        return;
    }
    int64_t start = esp_timer_get_time();
    raytrace_demo_scene scene = raytrace_demo_default_scene();
    int scene_id = (block / 2) % 3;
    if (scene_id == 1) {
        scene.sphere_x = 32;
        scene.sphere_y = 127;
    } else if (scene_id == 2) {
        scene.light_x = 148;
        scene.light_y = 112;
    }
    const uint32_t caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
    uint16_t *pixels = heap_caps_aligned_alloc(64, BYTES, caps);
    uint16_t *first = heap_caps_aligned_alloc(64, BYTES, caps);
    int64_t setup_us = esp_timer_get_time() - start;
    if (!pixels || !first) {
        puts("raybench: could not allocate two 51200-byte PSRAM buffers");
        goto done;
    }
    bool pie_first = block % 2 != 0;
    sample frame, depth;
    // Warm each implementation and the full output allocation before measuring.
    if (!run_stage(pixels, &scene, true, RAYTRACE_DEMO_SCALAR, NULL) ||
        !run_stage(pixels, &scene, true, RAYTRACE_DEMO_PIE, NULL) ||
        !sample_pair(pixels, first, &scene, false, pie_first, &depth) ||
        !sample_pair(pixels, first, &scene, true, pie_first, &frame)) {
        puts("raybench: renderer rejected the measurement");
        goto done;
    }
    // Occupancy and checksum accounting are intentionally a separate, untimed call.
    raytrace_demo_stats stats = {0};
    if (!run_stage(pixels, &scene, true, RAYTRACE_DEMO_PIE, &stats)) {
        puts("raybench: occupancy pass failed");
        goto done;
    }
    bool instrumented_equal = memcmp(pixels, first, BYTES) == 0;
    printf("RAYROW {\"block\":%ld,\"scene\":%d,\"sphere\":[%d,%d],\"light\":[%d,%d],"
           "\"pieFirst\":%d,\"setupUs\":%" PRId64 ",\"frameUs\":[%" PRId64 ",%" PRId64 "],"
           "\"intersectionUs\":[%" PRId64 ",%" PRId64 "],\"equalFrame\":%d,\"equalDepth\":%d,"
           "\"equalInstrumented\":%d,\"frameCRC\":\"%08" PRIx32 "\",\"depthCRC\":\"%08" PRIx32 "\","
           "\"rays\":%" PRIu32 ",\"sphereTests\":%" PRIu32 ",\"sphereHits\":%" PRIu32 ","
           "\"hitPixels\":%" PRIu32 ",\"shadowPixels\":%" PRIu32 ",\"pieGroups\":%" PRIu32 ","
           "\"pieActiveLanes\":%" PRIu32 "}\n",
           block, scene_id, scene.sphere_x, scene.sphere_y, scene.light_x, scene.light_y,
           pie_first, setup_us, frame.scalar_us, frame.pie_us, depth.scalar_us, depth.pie_us,
           frame.equal, depth.equal, instrumented_equal, frame.crc, depth.crc, stats.rays,
           stats.sphere_tests, stats.sphere_hits, stats.hit_pixels, stats.shadow_pixels,
           stats.pie_groups, stats.pie_active_lanes);
done:
    heap_caps_free(first);
    heap_caps_free(pixels);
}
