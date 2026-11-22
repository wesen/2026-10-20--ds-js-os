/* 06-driver.c: render one scene with one kernel instance, on the host or in the counting interpreter.
 *
 * Build defines: CDL_NS (the instance, e.g. cdl_cpu), CDL_SECTIONS (its table for the scene, e.g.
 * cdl_cpu_sections_B_01, or 0 for a single-translation-unit instance).
 *
 *   host:  driver SCENE.bin SPP OUT.rgbf [AOV.bin]
 *          renders frame indices 0..SPP-1 (one camera sample each, as the progressive renderer will) and
 *          writes the mean RGB per pixel as f32 triples; AOV.bin receives the accumulated c, alb and nrm
 *          vec4 rows (the post pass's inputs). Prints the digest of frame 0 and the mean luminance.
 *   rv32:  linked with the scene blob (symbol cdl_blob) for 05-rv32imfc-count; renders frame 0 only, with a
 *          counted region around each row's render loop (the device times the same region with rdcycle),
 *          writes the RGB floats to fd 1 and "digest <hex>" to fd 2.
 *
 * The digest is FNV-1a over the 48 bytes of every pixel's cdl_pixout in row-major order; the device app
 * (board/main/bench.c) computes the same one, so equal digests mean equal arithmetic. */
#include <stdint.h>
#include <string.h>
#include "cdl_api.h"

#define XCAT2(a, b) a##b
#define XCAT(a, b) XCAT2(a, b)
#define NSF(f) XCAT(CDL_NS, _##f)
CDL_DECLARE_INSTANCE(CDL_NS)
#if CDL_SECTIONS_NONE
#define SECTIONS_PTR ((const void *)0)
#else
extern const char CDL_SECTIONS[];
#define SECTIONS_PTR ((const void *)CDL_SECTIONS)
#endif

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
static long sys(long n, long a, long b, long c) {
  register long a0 asm("a0") = a, a1 asm("a1") = b, a2 asm("a2") = c, a7 asm("a7") = n;
  asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
  return a0;
}
static void put(int fd, const char *s) { sys(64, fd, (long)s, (long)strlen(s)); }
static void hex(char *o, uint32_t v) { for (int k = 7; k >= 0; k--) { o[k] = "0123456789abcdef"[v & 15]; v >>= 4; } o[8] = 0; }
int main(void);
__attribute__((naked, section(".text.start"))) void _start(void) { asm volatile("call main\n li a7, 93\n ecall\n"); }
int main(void) {
  cdl_buffers b; bind_blob(&b, cdl_blob);
  if (NSF(sky_bytes)() > sizeof sky_ws) { put(2, "sky workspace too small\n"); return 3; }
  if (!NSF(bind)(&b, SECTIONS_PTR, sky_ws)) { put(2, "bind failed\n"); return 4; }
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
int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: driver SCENE.bin SPP OUT.rgbf [AOV.bin]\n"); return 2; }
  FILE *f = fopen(argv[1], "rb"); if (!f) { perror(argv[1]); return 2; }
  fseek(f, 0, SEEK_END); long len = ftell(f); fseek(f, 0, SEEK_SET);
  uint32_t *blob = malloc(len); if (fread(blob, 1, len, f) != (size_t)len) return 2; fclose(f);
  const int spp = atoi(argv[2]);
  cdl_buffers b; bind_blob(&b, blob);
  if (NSF(sky_bytes)() > sizeof sky_ws) { fprintf(stderr, "sky workspace too small\n"); return 3; }
  if (!NSF(bind)(&b, SECTIONS_PTR, sky_ws)) { fprintf(stderr, "bind failed\n"); return 4; }
  const int W = (int)b.U[0], H = (int)b.U[1];
  float *acc = calloc((size_t)W * H * 12, sizeof(float));
  uint32_t h = 2166136261u;
  for (int s = 0; s < spp; s++)
    for (int y = 0; y < H; y++) {
      NSF(render_span)(y, 0, W, (unsigned)s, row);
      for (int x = 0; x < W; x++) {
        if (s == 0) h = fnv(h, &row[x], sizeof row[x]);
        float *a = acc + 12 * ((size_t)y * W + x);
        for (int k = 0; k < 4; k++) { a[k] += row[x].c[k]; a[4 + k] += row[x].alb[k]; a[8 + k] += row[x].nrm[k]; }
      }
    }
  FILE *o = fopen(argv[3], "wb"); double lum = 0;
  for (int i = 0; i < W * H; i++) {
    const float *a = acc + 12 * (size_t)i; float c[3] = {a[0] / spp, a[1] / spp, a[2] / spp};
    fwrite(c, 4, 3, o); lum += 0.2126f * c[0] + 0.7152f * c[1] + 0.0722f * c[2];
  }
  fclose(o);
  if (argc > 4) { FILE *q = fopen(argv[4], "wb"); fwrite(acc, sizeof(float), (size_t)W * H * 12, q); fclose(q); }
  printf("{\"digest0\": \"%08x\", \"meanLuminance\": %.9g, \"width\": %d, \"height\": %d, \"spp\": %d}\n", h, lum / (W * H), W, H, spp);
  return 0;
}
#endif
