// Isolate the production C RGB565 expression with the same scalar parameters.
#include "raytrace_demo.c"

uint16_t director_rgb565(int red, int green, int blue, int scale) {
    return rgb565(red, green, blue, scale);
}
