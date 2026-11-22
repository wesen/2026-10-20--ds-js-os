// Bare RV32 runner (rv32emu syscalls: a7 = 2 writes a0 = fd, a1, a2; a7 = 1 exits) for the scalar C renderer, for instruction counts in rv32emu.
// Renders the opening pose (sphere 68,61; light 31,25) as the board's C frame does
// (RAYTRACE_DEMO_SCALAR, no stats), then writes the 160x160 RGB565 cells to stdout.
// Built with -DBASELINE, it skips the render, so the difference of the two counts is the frame.
#include <stddef.h>
#include <stdint.h>
#include "raytrace_demo.h"

static uint16_t pixels[160 * 160];

// Word-wise, as newlib's routines on the board are; the attribute stops GCC from turning
// the loops back into calls to themselves.
#define NO_PATTERNS __attribute__((optimize("no-tree-loop-distribute-patterns")))
NO_PATTERNS void *memset(void *d, int c, size_t n) {
    unsigned char *p = d;
    if (((uintptr_t)p & 3) == 0) {
        uint32_t w = (unsigned char)c * 0x01010101u;
        for (; n >= 16; n -= 16, p += 16) { ((uint32_t *)p)[0] = w; ((uint32_t *)p)[1] = w; ((uint32_t *)p)[2] = w; ((uint32_t *)p)[3] = w; }
        for (; n >= 4; n -= 4, p += 4) *(uint32_t *)p = w;
    }
    while (n--) *p++ = (unsigned char)c;
    return d;
}
NO_PATTERNS void *memcpy(void *d, const void *s, size_t n) {
    unsigned char *p = d; const unsigned char *q = s;
    if ((((uintptr_t)p | (uintptr_t)q) & 3) == 0)
        for (; n >= 4; n -= 4, p += 4, q += 4) *(uint32_t *)p = *(const uint32_t *)q;
    while (n--) *p++ = *q++;
    return d;
}
int abs(int x) { return x < 0 ? -x : x; }

static long syscall3(long n, long a, long b, long c) {
    register long a0 asm("a0") = a, a1 asm("a1") = b, a2 asm("a2") = c, a7 asm("a7") = n;
    asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
    return a0;
}

void _start(void) {
    raytrace_demo_scene scene = {68, 61, 31, 25};
#ifndef BASELINE
    if (!raytrace_demo_render(pixels, 160, &scene, RAYTRACE_DEMO_SCALAR, NULL)) syscall3(1, 1, 0, 0);
#endif
    syscall3(2, 1, (long)pixels, sizeof pixels);
    syscall3(1, 0, 0, 0);
}
