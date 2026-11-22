/* driver.c: render one scene with one PICOCALC-CANDELA-CPU-KERNEL kernel instance, its sections either compiled
 * (the scene's <ns>_sections_<ID>) or interpreted (<ns>_sections_vm with a bytecode blob). Derived from that ticket's
 * scripts/06-driver.c; the frame digest is the same FNV-1a over every pixel's 48-byte cdl_pixout of frame 0.
 *
 * Build defines: CDL_NS (the instance), CDL_SECTIONS (the scene's compiled table).
 *   host:  driver SCENE.bin SPP OUT.rgbf PIXELS.u32 [PROG.cdvm]
 *          renders frame indices 0..SPP-1; with PROG.cdvm the sections are interpreted. Writes the mean RGB per
 *          pixel (f32 triples) and, per pixel, an FNV-1a digest of its cdl_pixout over all SPP frames (u32).
 *          Prints one JSON line: frame-0 digest, digest of the per-pixel digests, mean luminance, seconds.
 *   rv32:  -DCDL_USE_VM=0 or 1; linked with the scene blob (cdl_blob) and the bytecode (cdl_prog .. cdl_prog_end) for
 *          the counting interpreter; renders frame 0 with a counted region around each row, writes the RGB floats
 *          to fd 1 and "digest <hex>" to fd 2. */
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include "cdl_api.h"

#define XCAT2(a, b) a##b
#define XCAT(a, b) XCAT2(a, b)
#define NSF(f) XCAT(CDL_NS, _##f)
CDL_DECLARE_INSTANCE(CDL_NS)
extern const char CDL_SECTIONS[];
extern const char NSF(sections_vm)[];
int NSF(vm_load)(const void *blob, size_t len, const float *U, unsigned nU, char *err, size_t errlen);

static uint32_t fnv(uint32_t h, const void *p, unsigned n) { const uint8_t *b = p; while (n--) h = (h ^ *b++) * 16777619u; return h; }
static void bind_blob(cdl_buffers *b, const uint32_t *blob) {
  const uint32_t *n = blob + 1;               /* magic 'CDL1', then the row counts of U, O, LI, BV, SD */
  const float *p = (const float *)(blob + 6);
  b->nU = n[0]; b->nO = n[1]; b->nLI = n[2]; b->nBV = n[3]; b->nSD = n[4];
  b->U = p; p += 4 * n[0]; b->O = p; p += 4 * n[1]; b->LI = p; p += 4 * n[2]; b->BV = p; p += 4 * n[3]; b->SD = p;
}
static uint32_t sky_ws[(64 * 64 * 3 + 32) * 4 / 4 + 64];   /* enough for CDL_SKY_N <= 64 */
static cdl_pixout row[4096];
static float rgb[4096 * 3];

#ifdef __riscv
extern const uint32_t cdl_blob[];
extern const unsigned char cdl_prog[], cdl_prog_end[];
static long sys(long n, long a, long b, long c) {
  register long a0 asm("a0") = a, a1 asm("a1") = b, a2 asm("a2") = c, a7 asm("a7") = n;
  asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
  return a0;
}
static void put(int fd, const char *s) { sys(64, fd, (long)s, (long)strlen(s)); }
static void hex(char *o, uint32_t v) { for (int k = 7; k >= 0; k--) { o[k] = "0123456789abcdef"[v & 15]; v >>= 4; } o[8] = 0; }
/* newlib's libm stores errno through a reentrancy structure that nothing initialises on this bare machine */
int *__errno(void) { static int e; return &e; }
int main(void);
__attribute__((naked, section(".text.start"))) void _start(void) { asm volatile("call main\n li a7, 93\n ecall\n"); }
int main(void) {
  cdl_buffers b; bind_blob(&b, cdl_blob);
  if (NSF(sky_bytes)() > sizeof sky_ws) { put(2, "sky workspace too small\n"); return 3; }
#if CDL_USE_VM
  if (!NSF(bind)(&b, NSF(sections_vm), sky_ws)) { put(2, "bind failed\n"); return 4; }
  char err[160];
  if (NSF(vm_load)(cdl_prog, (size_t)(cdl_prog_end - cdl_prog), b.U, b.nU, err, sizeof err)) { put(2, "vm_load: "); put(2, err); put(2, "\n"); return 5; }
#else
  if (!NSF(bind)(&b, CDL_SECTIONS, sky_ws)) { put(2, "bind failed\n"); return 4; }
#endif
  const int W = (int)b.U[0], H = (int)b.U[1];
  uint32_t h = 2166136261u;
  for (int y = 0; y < H; y++) {
    sys(500, 1, 0, 0);
    NSF(render_span)(y, 0, W, 0, row);
    sys(500, 0, 0, 0);
    for (int x = 0; x < W; x++) { h = fnv(h, &row[x], sizeof row[x]); rgb[3 * x] = row[x].c[0]; rgb[3 * x + 1] = row[x].c[1]; rgb[3 * x + 2] = row[x].c[2]; }
    sys(64, 1, (long)rgb, 12 * W);
  }
  sys(500, 2, 1, 0);
  char s[32] = "digest "; hex(s + 7, h); strcat(s, "\n"); put(2, s);
  return 0;
}
#else
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
static void *slurp(const char *path, size_t *len) {
  FILE *f = fopen(path, "rb"); if (!f) { perror(path); exit(2); }
  fseek(f, 0, SEEK_END); *len = (size_t)ftell(f); fseek(f, 0, SEEK_SET);
  void *p = malloc(*len + 16); if (fread(p, 1, *len, f) != *len) exit(2); fclose(f); return p;
}
int main(int argc, char **argv) {
  if (argc < 5) { fprintf(stderr, "usage: driver SCENE.bin SPP OUT.rgbf PIXELS.u32 [PROG.cdvm]\n"); return 2; }
  size_t len; uint32_t *blob = slurp(argv[1], &len);
  const int spp = atoi(argv[2]);
  cdl_buffers b; bind_blob(&b, blob);
  if (NSF(sky_bytes)() > sizeof sky_ws) { fprintf(stderr, "sky workspace too small\n"); return 3; }
  const int vm = argc > 5;
  if (!NSF(bind)(&b, vm ? (const void *)NSF(sections_vm) : (const void *)CDL_SECTIONS, sky_ws)) { fprintf(stderr, "bind failed\n"); return 4; }
  if (vm) {
    size_t plen; void *prog = slurp(argv[5], &plen); char err[160];
    if (NSF(vm_load)(prog, plen, b.U, b.nU, err, sizeof err)) { fprintf(stderr, "vm_load: %s\n", err); return 5; }
  }
  const int W = (int)b.U[0], H = (int)b.U[1];
  float *acc = calloc((size_t)W * H * 4, sizeof(float));
  uint32_t *pix = malloc((size_t)W * H * 4);
  for (int i = 0; i < W * H; i++) pix[i] = 2166136261u;
  uint32_t h = 2166136261u;
  const clock_t t0 = clock();
  for (int s = 0; s < spp; s++)
    for (int y = 0; y < H; y++) {
      NSF(render_span)(y, 0, W, (unsigned)s, row);
      for (int x = 0; x < W; x++) {
        if (s == 0) h = fnv(h, &row[x], sizeof row[x]);
        const size_t i = (size_t)y * W + x;
        pix[i] = fnv(pix[i], &row[x], sizeof row[x]);
        for (int k = 0; k < 3; k++) acc[4 * i + k] += row[x].c[k];
      }
    }
  const double secs = (double)(clock() - t0) / CLOCKS_PER_SEC;
  FILE *o = fopen(argv[3], "wb"); double lum = 0;
  for (int i = 0; i < W * H; i++) {
    const float c[3] = {acc[4 * i] / spp, acc[4 * i + 1] / spp, acc[4 * i + 2] / spp};
    fwrite(c, 4, 3, o); lum += 0.2126f * c[0] + 0.7152f * c[1] + 0.0722f * c[2];
  }
  fclose(o);
  FILE *q = fopen(argv[4], "wb"); fwrite(pix, 4, (size_t)W * H, q); fclose(q);
  const uint32_t all = fnv(2166136261u, pix, (unsigned)(4 * W * H));
  printf("{\"sections\": \"%s\", \"digest0\": \"%08x\", \"pixelDigests\": \"%08x\", \"meanLuminance\": %.9g, \"width\": %d, \"height\": %d, \"spp\": %d, \"seconds\": %.3f}\n",
         vm ? "vm" : "compiled", h, all, lum / (W * H), W, H, spp, secs);
  return 0;
}
#endif
