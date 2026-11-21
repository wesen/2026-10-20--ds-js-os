/* Run the portable reference on a short path in scene space and write binary PPMs. */
#include "raytrace_demo.h"
#include <stdint.h>
#include <stdio.h>

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    static uint16_t pixels[RAYTRACE_DEMO_SIDE * RAYTRACE_DEMO_SIDE];
    for (int i = 0; i < 24; i++) {
        int phase = i < 12 ? i : 24 - i;
        raytrace_demo_scene scene = raytrace_demo_default_scene();
        scene.sphere_x = 32 + 7 * phase;
        scene.light_x = 144 - 10 * phase;
        if (!raytrace_demo_render(pixels, RAYTRACE_DEMO_SIDE, &scene, RAYTRACE_DEMO_SCALAR, NULL)) return 1;
        char path[1024];
        int n = snprintf(path, sizeof path, "%s/frame-%02d.ppm", argv[1], i);
        if (n < 0 || n >= (int)sizeof path) return 1;
        FILE *f = fopen(path, "wb");
        if (!f) return 1;
        fprintf(f, "P6\n%d %d\n255\n", RAYTRACE_DEMO_SIDE, RAYTRACE_DEMO_SIDE);
        for (size_t j = 0; j < sizeof pixels / sizeof pixels[0]; j++) {
            unsigned v = pixels[j], r = v >> 11, g = (v >> 5) & 63, b = v & 31;
            unsigned char rgb[] = {(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)};
            if (fwrite(rgb, 1, sizeof rgb, f) != sizeof rgb) return 1;
        }
        if (fclose(f)) return 1;
    }
    return 0;
}
