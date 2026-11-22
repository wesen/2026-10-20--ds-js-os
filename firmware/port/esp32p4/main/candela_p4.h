#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

// All calls belong to the kernel task. Startup compiles trusted bundled source.
bool p4_candela_init(void);
bool p4_candela_frame(uint16_t *pixels, size_t stride, int fixture, int weight,
                      int light_x, int light_y);
void p4_candela_console(const char *args);
