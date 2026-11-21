// Compile with -Ipicocalc-os/nucleus. Including the production source exposes
// its private row and shading functions without changing the shipping ABI.
#include "raytrace_demo.c"

#include <stdio.h>

typedef struct {
    uint64_t tested, hits, active_rows;
} operations;

static void draw_spans(trace *work, int y, operations *counts) {
    memset(work->depth, 0, sizeof(work->depth));
    for (size_t i = 0; i < work->object_count; ++i) {
        const sphere *obj = &work->objects[i];
        int dy = y - obj->y;
        int row = obj->radius * obj->radius - dy * dy;
        if (row < 0) continue;
        counts->active_rows++;
        int extent = work->roots[row];
        int left = obj->x - extent, right = obj->x + extent;
        if (left < 0) left = 0;
        if (right >= SIDE) right = SIDE - 1;
        for (int x = left; x <= right; ++x) {
            int d = row - work->x_squared[i][x];
            if (d < 0 || d > MAX_RADIUS * MAX_RADIUS) abort();
            ++counts->tested;
            int depth = obj->z - work->roots[d];
            if (!work->depth[x] || depth < work->depth[x]) {
                work->depth[x] = depth;
                work->object_index[x] = (uint8_t)i;
            }
        }
    }
}

static void compare_scene(trace *control, unsigned scene, int light_x, int light_y) {
    trace trial = *control;
    light lamp = prepare_light(control, light_x, light_y);
    operations counts = {0};
    uint32_t crc = 2166136261u;
    for (int y = 0; y < SIDE; ++y) {
        counts.hits += trace_row(control, y, RAYTRACE_DEMO_SCALAR, true);
        draw_spans(&trial, y, &counts);
        for (int x = 0; x < SIDE; ++x) {
            if (control->depth[x] != trial.depth[x]) abort();
            bool hit = trial.depth[x] != 0;
            if (hit && control->object_index[x] != trial.object_index[x]) abort();
            uint16_t color = hit ? shade_sphere(&trial, &lamp, x, y) :
                shade_floor(x, y, in_shadow(&trial, &lamp, x, y));
            uint16_t expected = hit ? shade_sphere(control, &lamp, x, y) :
                shade_floor(x, y, in_shadow(control, &lamp, x, y));
            if (color != expected) abort();
            crc = (crc ^ (color & 255u)) * 16777619u;
            crc = (crc ^ (color >> 8)) * 16777619u;
        }
    }
    if (counts.hits != counts.tested) abort();
    printf("%s{\"scene\":%u,\"fullSpherePixelPairs\":%zu,\"activeSphereRows\":%llu,"
           "\"spanPairs\":%llu,\"frameFnv\":\"%08x\"}", scene ? ",\n" : "", scene,
           control->object_count * SIDE * SIDE, (unsigned long long)counts.active_rows,
           (unsigned long long)counts.tested, (unsigned)crc);
}

int main(void) {
    raytrace_demo_scene scenes[] = {{68,61,31,25},{32,127,31,25},{127,32,159,0}};
    trace ref = {0};
    puts("[");
    for (unsigned i = 0; i < 3; ++i) {
        prepare(&ref, &scenes[i]);
        compare_scene(&ref, i, scenes[i].light_x, scenes[i].light_y);
    }
    // Equal depth and silhouette: the earlier sphere must keep its color.
    ref.objects[1] = ref.objects[0];
    ref.objects[1].red = 0;
    ref.objects[2].radius = 1;
    prepare_tables(&ref);
    compare_scene(&ref, 3, 0, 159);
    puts("\n]");
}
