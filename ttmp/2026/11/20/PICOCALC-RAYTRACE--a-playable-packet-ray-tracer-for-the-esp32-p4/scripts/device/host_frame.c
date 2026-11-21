#include "raytrace_demo.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(int argc, char **argv) {
    if (argc != 6) return 2;
    raytrace_demo_scene scene = {atoi(argv[2]), atoi(argv[3]), atoi(argv[4]), atoi(argv[5])};
    uint16_t frame[RAYTRACE_DEMO_SIDE * RAYTRACE_DEMO_SIDE];
    bool ok = false;
    if (!strcmp(argv[1], "frame"))
        ok = raytrace_demo_render(frame, RAYTRACE_DEMO_SIDE, &scene, RAYTRACE_DEMO_SCALAR, NULL);
    if (!strcmp(argv[1], "depth"))
        ok = raytrace_demo_intersections((int16_t *)frame, RAYTRACE_DEMO_SIDE, &scene, RAYTRACE_DEMO_SCALAR, NULL);
    if (!ok) return 2;
    for (size_t i = 0; i < sizeof frame / sizeof *frame; i++)
        if (putchar(frame[i] & 255) == EOF || putchar(frame[i] >> 8) == EOF) return 1;
    return 0;
}
