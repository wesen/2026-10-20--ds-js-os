// 05-harness.cpp: run Candela's translated kernel (04-wgsl2cpp.mjs output) over a frame on a CPU.
// Built twice by 07-run-kernel.sh: natively on the host (reads scene.bin, writes float RGB) and for
// the ESP32-P4's RV32IMAFC with the ESP GCC (scene.bin linked in with .incbin, output through the
// counting interpreter's write call). The accessors U, objF, litF, bvhF and sdF read the buffers
// Candela's pack() produced, exactly as render.js binds them to the GPU. One call of renderPixel is one
// camera sample through tracePath (or the AOV/custom kernels) with the scene's engine settings.
#ifndef KERNEL
#error "build with -DKERNEL=\"path/kernel.cpp\""
#endif
#include KERNEL

namespace cdl {
static const float *gU, *gO, *gL, *gB, *gS;
static inline vec4f row(const float *p, i32 i) { p += 4 * i; return vec4f(p[0], p[1], p[2], p[3]); }
static vec4f U(i32 i) { return row(gU, i); }
static vec4f objF(i32 i) { return row(gO, i); }
static vec4f litF(i32 i) { return row(gL, i); }
static vec4f bvhF(i32 i) { return row(gB, i); }
static vec4f sdF(i32 i) { return row(gS, i); }

static void bind(const unsigned *blob) {
  const unsigned *n = blob + 1;                 // [magic, nU, nO, nLI, nBV, nSD]
  const float *p = (const float *)(blob + 6);
  gU = p; p += 4 * n[0]; gO = p; p += 4 * n[1]; gL = p; p += 4 * n[2]; gB = p; p += 4 * n[3]; gS = p;
}
} // namespace cdl
using namespace cdl;

#ifndef SPP
#define SPP 1
#endif
static float line[4096 * 3];

#ifdef __riscv
extern "C" const unsigned cdl_scene[];
static void emit(const void *p, unsigned n) {
  register long a0 asm("a0") = 1, a1 asm("a1") = (long)p, a2 asm("a2") = n, a7 asm("a7") = 64;
  asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
}
extern "C" int main();
extern "C" __attribute__((naked, section(".text.start"))) void _start() {
  asm volatile("call main\n li a7, 93\n ecall\n");
}
extern "C" int main() {
  bind(cdl_scene);
#else
#include <stdio.h>
#include <stdlib.h>
static FILE *fout;
static void emit(const void *p, unsigned n) { fwrite(p, 1, n, fout); }
int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: harness scene.bin out.rgbf\n"); return 2; }
  FILE *fin = fopen(argv[1], "rb"); fseek(fin, 0, SEEK_END); long len = ftell(fin); fseek(fin, 0, SEEK_SET);
  unsigned *blob = (unsigned *)malloc(len); if (fread(blob, 1, len, fin) != (size_t)len) return 2; fclose(fin);
  fout = fopen(argv[2], "wb");
  bind(blob);
#endif
  const i32 W = i32(U(0).x), H = i32(U(0).y);
#ifndef BASELINE
  for (i32 y = 0; y < H; y++) {
    for (i32 x = 0; x < W; x++) {
      vec3f acc(0.0f);
      for (u32 s = 0; s < SPP; s++) { const PixOut o = renderPixel(vec2f(f32(x), f32(y)), s); acc = acc + vec3f(o.c.x, o.c.y, o.c.z); }
      line[3 * x] = acc.x / SPP; line[3 * x + 1] = acc.y / SPP; line[3 * x + 2] = acc.z / SPP;
    }
    emit(line, 12 * W);
  }
#endif
  return 0;
}
