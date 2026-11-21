#include "raytrace_demo.h"

#include <assert.h>
#include <inttypes.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

enum { WIDTH = RAYTRACE_DEMO_SIDE, PITCH = WIDTH + 3, N = PITCH * WIDTH + 2 };
static _Alignas(16) uint16_t pixels[2][N];
static _Alignas(16) int16_t depths[2][N];
static unsigned modeled_groups;

#ifdef RAYTRACE_DEMO_TEST_PIE
void raytrace_demo_pie_row(const int16_t *horizontal, const int16_t *term, int16_t *out, size_t groups) {
    assert((uintptr_t)horizontal % 16 == 0 && (uintptr_t)out % 16 == 0);
    assert(groups == WIDTH / 8);
    modeled_groups += groups;
    for (size_t lane = 0; lane < groups * 8; ++lane) {
        const int result = (int)*term - horizontal[lane];
        out[lane] = result < INT16_MIN ? INT16_MIN : result > INT16_MAX ? INT16_MAX : (int16_t)result;
    }
}
#endif

static uint32_t hash_region(const void *data) {
    uint32_t hash = UINT32_C(2166136261);
    const uint8_t *bytes = data;
    for (int y = 0; y < WIDTH; ++y) {
        for (int x = 0; x < WIDTH; ++x) {
            uint16_t value;
            memcpy(&value, bytes + (y * PITCH + x) * sizeof(value), sizeof(value));
            hash = (hash ^ (value & 255)) * UINT32_C(16777619);
            hash = (hash ^ (value >> 8)) * UINT32_C(16777619);
        }
    }
    return hash;
}

static unsigned reference(const raytrace_demo_scene *scene, uint32_t *hit_pixels, uint32_t *shadow_pixels) {
    // Use direct double-precision ray/sphere intersections without shadow pruning.
    const int objects[][4] = {{scene->sphere_x,scene->sphere_y,56,26}, {100,65,105,32}, {58,109,86,23}};
    const int light_x = (scene->light_x - 80) * 3 / 10;
    const int light_y = (scene->light_y - 80) * 3 / 10;
    const double a = light_x * light_x + light_y * light_y + 1024;
    unsigned hits = 0;
    *hit_pixels = *shadow_pixels = 0;
    for (int y = 0; y < WIDTH; ++y) {
        for (int x = 0; x < WIDTH; ++x) {
            int nearest = 0;
            bool shadow = false;
            for (unsigned i = 0; i < sizeof(objects) / sizeof(objects[0]); ++i) {
                const double dx = objects[i][0] - x;
                const double dy = objects[i][1] - y;
                const double dz = objects[i][2] - 156;
                const double r2 = objects[i][3] * objects[i][3];
                const double primary = r2 - dx * dx - dy * dy;
                if (primary >= 0) {
                    ++hits;
                    const int z = objects[i][2] - (int)sqrt(primary);
                    if (!nearest || z < nearest) nearest = z;
                }
                const double b = -2.0 * (dx * light_x + dy * light_y - 32.0 * dz);
                const double c = dx * dx + dy * dy + dz * dz - r2;
                if (b < 0 && b * b >= 4.0 * a * c) shadow = true;
            }
            *hit_pixels += nearest != 0;
            *shadow_pixels += nearest == 0 && shadow;
            assert(depths[0][1 + y * PITCH + x] == nearest);
        }
    }
    return hits;
}

static void run(const raytrace_demo_scene *scene, const char *label, unsigned index) {
    memset(pixels, 0xa5, sizeof(pixels));
    memset(depths, 0x5a, sizeof(depths));
    raytrace_demo_stats scalar, scalar_depth;
    const unsigned before = modeled_groups;
    assert(raytrace_demo_render(pixels[0] + 1, PITCH, scene, RAYTRACE_DEMO_SCALAR, &scalar));
    assert(raytrace_demo_intersections(depths[0] + 1, PITCH, scene, RAYTRACE_DEMO_SCALAR, &scalar_depth));
    assert(scalar.rays == WIDTH * WIDTH && scalar.sphere_tests == 3 * scalar.rays);
    assert(scalar_depth.hit_pixels == scalar.hit_pixels && scalar_depth.sphere_hits == scalar.sphere_hits);
    assert(scalar_depth.shadow_pixels == 0 && scalar.pie_groups == 0 && scalar.pie_active_lanes == 0);
    assert(scalar.checksum == hash_region(pixels[0] + 1));
    assert(scalar_depth.checksum == hash_region(depths[0] + 1));

    uint32_t hit_pixels, shadow_pixels;
    const unsigned hits = reference(scene, &hit_pixels, &shadow_pixels);
    assert(scalar.sphere_hits == hits && scalar.hit_pixels == hit_pixels && scalar.shadow_pixels == shadow_pixels);
    assert(raytrace_demo_render(pixels[1] + 1, PITCH, scene, RAYTRACE_DEMO_SCALAR, NULL));
    assert(raytrace_demo_intersections(depths[1] + 1, PITCH, scene, RAYTRACE_DEMO_SCALAR, NULL));
    assert(memcmp(pixels[0], pixels[1], sizeof(pixels[0])) == 0);
    assert(memcmp(depths[0], depths[1], sizeof(depths[0])) == 0);
    memset(pixels[1], 0xa5, sizeof(pixels[1]));
    memset(depths[1], 0x5a, sizeof(depths[1]));
    if (raytrace_demo_has_pie()) {
        raytrace_demo_stats packed, packed_depth;
        assert(raytrace_demo_render(pixels[1] + 1, PITCH, scene, RAYTRACE_DEMO_PIE, &packed));
        assert(raytrace_demo_intersections(depths[1] + 1, PITCH, scene, RAYTRACE_DEMO_PIE, &packed_depth));
        assert(memcmp(pixels[0], pixels[1], sizeof(pixels[0])) == 0);
        assert(memcmp(depths[0], depths[1], sizeof(depths[0])) == 0);
        assert(packed.checksum == scalar.checksum && packed_depth.checksum == scalar_depth.checksum);
        assert(packed.rays == scalar.rays && packed.sphere_tests == scalar.sphere_tests);
        assert(packed.hit_pixels == hit_pixels && packed.shadow_pixels == shadow_pixels);
        assert(packed.sphere_hits == hits && packed_depth.sphere_hits == hits);
        assert(packed.pie_groups * 8 == scalar.sphere_tests && packed.pie_active_lanes == hits);
        assert(packed_depth.pie_groups == packed.pie_groups && packed_depth.pie_active_lanes == hits);
        assert(modeled_groups - before == 2 * packed.pie_groups);
    } else {
        assert(!raytrace_demo_render(pixels[1] + 1, PITCH, scene, RAYTRACE_DEMO_PIE, NULL));
        assert(!raytrace_demo_intersections(depths[1] + 1, PITCH, scene, RAYTRACE_DEMO_PIE, NULL));
        assert(modeled_groups == before);
    }
    assert(pixels[0][0] == 0xa5a5 && pixels[0][N - 1] == 0xa5a5);
    assert(depths[0][0] == 0x5a5a && depths[0][N - 1] == 0x5a5a);
    for (int y = 0; y < WIDTH; ++y) {
        for (int x = WIDTH; x < PITCH; ++x) {
            assert(pixels[0][1 + y * PITCH + x] == 0xa5a5);
            assert(depths[0][1 + y * PITCH + x] == 0x5a5a);
        }
    }
    printf("%s{\"case\":\"%s\",\"scene\":[%d,%d,%d,%d],\"pixels\":\"%08" PRIx32
           "\",\"depth\":\"%08" PRIx32 "\",\"sphereHits\":%" PRIu32
           ",\"hitPixels\":%" PRIu32 ",\"shadowPixels\":%" PRIu32 "}",
           index ? ",\n" : "", label, scene->sphere_x, scene->sphere_y, scene->light_x, scene->light_y,
           scalar.checksum, scalar_depth.checksum, scalar.sphere_hits, scalar.hit_pixels, scalar.shadow_pixels);
}

int main(void) {
    raytrace_demo_scene scenes[] = {
        raytrace_demo_default_scene(), {68,61,128,25}, {32,32,0,0}, {127,127,159,159},
        {32,127,159,0}, {127,32,0,159}, {100,65,80,80}, {58,109,79,79}, {80,80,0,80},
        {80,80,159,80}, {95,52,80,159}, {85,97,80,0},
    };
    printf("{\"hostPackedModel\":%s,\"cases\":[\n", raytrace_demo_has_pie() ? "true" : "false");
    for (unsigned i = 0; i < sizeof(scenes) / sizeof(scenes[0]); ++i)
        run(&scenes[i], i == 0 ? "default" : i == 1 ? "move lamp" : "scene control", i);
    raytrace_demo_stats stats = {.checksum=42};
    raytrace_demo_scene invalid = {.sphere_x=31,.sphere_y=61,.light_x=31,.light_y=25};
    const uint16_t before = pixels[0][1];
    assert(!raytrace_demo_render(pixels[0] + 1, PITCH, &invalid, RAYTRACE_DEMO_SCALAR, &stats));
    assert(!raytrace_demo_render(pixels[0] + 1, SIZE_MAX, &scenes[0], RAYTRACE_DEMO_SCALAR, &stats));
    assert(!raytrace_demo_render(pixels[0] + 1, WIDTH - 1, &scenes[0], RAYTRACE_DEMO_SCALAR, &stats));
    assert(!raytrace_demo_render(pixels[0] + 1, PITCH, NULL, RAYTRACE_DEMO_SCALAR, &stats));
    assert(!raytrace_demo_render(pixels[0] + 1, PITCH, &scenes[0], (raytrace_demo_mode)999, &stats));
    assert(!raytrace_demo_intersections(NULL, PITCH, &scenes[0], RAYTRACE_DEMO_SCALAR, &stats));
    assert(stats.checksum == 42 && pixels[0][1] == before);
    printf("\n],\"modeledGroups\":%u}\n", modeled_groups);
}
