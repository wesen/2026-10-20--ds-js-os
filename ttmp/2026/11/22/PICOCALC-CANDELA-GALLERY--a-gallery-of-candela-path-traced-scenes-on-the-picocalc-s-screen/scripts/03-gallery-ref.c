/* 03-gallery-ref.c: the gallery's renderer core (picocalc-os/nucleus/candela_gallery.c) off the device, as the host
 * reference of the device's digests (PICOCALC-CANDELA-GALLERY). Linked with the same scene table, kernel instances
 * (candela_gallery_instance.cpp: cg = cpu arm, cgs = cpu arm with CDL_SPECTRAL) and section interpreter as the
 * firmware.
 *
 *   host:  gallery-ref PASSES OUTDIR [ID ...]
 *          per scene: the frame-0 digest (CPU-KERNEL's: FNV-1a over every pixel's 48-byte cdl_pixout of a plain
 *          row-major pass at frame index 0); the progressive render to PASSES passes exactly as the device runs it
 *          (cg_advance: sub-passes, Candela's frame indices, the meter schedule); the accumulation's digest and mean
 *          luminance; the display (RGB565, w x h) through the gallery's fast AgX and through CPU-KERNEL's generated
 *          displayPx, their digests and how many pixels differ; the image upscaled to 320 x 320 as OUTDIR/ID.ppm.
 *          One JSON line per scene.
 *   rv32:  -DREF_SCENE=<index> -DREF_PASSES=<n>, for the counting interpreter: the same, without the display,
 *          with a counted region around the progressive render; "frame0 <hex>", "acc <hex>", "disp <hex>" on fd 2. */
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include "candela_gallery.h"

extern const cg_instance cg_gallery, cgs_gallery;
static const cg_instance *instance_for(const cg_scene_desc *d) { return d->spectral ? &cgs_gallery : &cg_gallery; }
static cdl_pixout scratch[CG_MAX_SIDE];

#ifdef __riscv
/* a bump allocator: nothing is freed for good on this bare machine */
static uint8_t heap[3 << 20] __attribute__((aligned(16)));
static size_t used;
static void *bump(size_t n) { n = (n + 15) & ~(size_t)15; if (used + n > sizeof heap) return NULL; void *p = heap + used; used += n; return p; }
static void nofree(void *p) { (void)p; }
static long sys(long n, long a, long b, long c) {
  register long a0 asm("a0") = a, a1 asm("a1") = b, a2 asm("a2") = c, a7 asm("a7") = n;
  asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
  return a0;
}
static void put(int fd, const char *s) { sys(64, fd, (long)s, (long)strlen(s)); }
static void hex(char *o, uint32_t v) { for (int k = 7; k >= 0; k--) { o[k] = "0123456789abcdef"[v & 15]; v >>= 4; } o[8] = 0; }
static void line(const char *tag, uint32_t v) { char s[48]; strcpy(s, tag); size_t n = strlen(s); s[n++] = ' '; hex(s + n, v); strcat(s, "\n"); put(2, s); }
int *__errno(void) { static int e; return &e; }
int main(void);
__attribute__((naked, section(".text.start"))) void _start(void) { asm volatile("call main\n li a7, 93\n ecall\n"); }
static uint16_t disp[CG_MAX_SIDE * CG_MAX_SIDE];
static cg_state st;
int main(void) {
  const cg_alloc a = {bump, bump, nofree};
  const cg_scene_desc *d = &cg_scenes[REF_SCENE];
  char err[160];
  if (cg_begin(&st, d, instance_for(d), &a, err, sizeof err)) { put(2, "begin: "); put(2, err); put(2, "\n"); return 5; }
  line("frame0", cg_frame0_digest(&st, scratch, NULL));
  sys(500, 1, 0, 0);
  while (st.pass < REF_PASSES) cg_advance(&st);
  sys(500, 0, 0, 0);
  sys(500, 2, 1, 0);
  line("acc", cg_acc_digest(&st, NULL));
  cg_display(&st, disp, CG_FAST);
  line("disp", cg_fnv(2166136261u, disp, sizeof(uint16_t) * st.w * st.h));
  return 0;
}
#else
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
static void *big(size_t n) { return aligned_alloc(16, (n + 15) & ~(size_t)15); }
static void write_ppm(const char *path, const uint16_t *p) {
  FILE *f = fopen(path, "wb");
  if (!f) { perror(path); return; }
  fprintf(f, "P6\n320 320\n255\n");
  for (int i = 0; i < 320 * 320; i++) {
    const unsigned v = p[i], r = v >> 11, g = (v >> 5) & 63, b = v & 31;
    const unsigned char o[3] = {(unsigned char)((r * 255 + 15) / 31), (unsigned char)((g * 255 + 31) / 63), (unsigned char)((b * 255 + 15) / 31)};
    fwrite(o, 1, 3, f);
  }
  fclose(f);
}
int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: gallery-ref PASSES OUTDIR [ID ...]\n"); return 2; }
  const unsigned passes = (unsigned)atoi(argv[1]);
  const cg_alloc a = {big, big, free};
  static uint16_t fast[CG_MAX_SIDE * CG_MAX_SIDE], exact[CG_MAX_SIDE * CG_MAX_SIDE], up[320 * 320], coarse[CG_MAX_SIDE * CG_MAX_SIDE];
  cg_state st;
  memset(&st, 0, sizeof st);
  for (unsigned k = 0; k < cg_nscenes; k++) {
    const cg_scene_desc *d = &cg_scenes[k];
    int want = argc == 3;
    for (int i = 3; i < argc; i++) want |= !strcmp(argv[i], d->id);
    if (!want) continue;
    char err[160];
    if (cg_begin(&st, d, instance_for(d), &a, err, sizeof err)) { printf("{\"id\": \"%s\", \"error\": \"%s\"}\n", d->id, err); continue; }
    double lum0;
    const uint32_t f0 = cg_frame0_digest(&st, scratch, &lum0);
    const int bound = st.bound;
    double evs[8]; unsigned nev = 0;
    uint32_t coarse_digest = 0;
    const clock_t t0 = clock();
    while (st.pass < passes) {
      const unsigned m = st.metered;
      const int ev = cg_advance(&st);
      if (st.metered != m && nev < 8) evs[nev++] = st.ev;
      if (ev == CG_EV_COARSE) { cg_display(&st, coarse, CG_FAST); coarse_digest = cg_fnv(2166136261u, coarse, sizeof(uint16_t) * st.w * st.h); }
    }
    const double secs = (double)(clock() - t0) / CLOCKS_PER_SEC;
    double lum;
    const uint32_t acc = cg_acc_digest(&st, &lum);
    cg_display(&st, fast, CG_FAST);
    cg_display(&st, exact, CG_EXACT);
    unsigned differ = 0, maxd = 0;
    for (int i = 0; i < st.w * st.h; i++) if (fast[i] != exact[i]) {
      differ++;
      const int dr = abs((fast[i] >> 11) - (exact[i] >> 11)), dg = abs(((fast[i] >> 5) & 63) - ((exact[i] >> 5) & 63)), db = abs((fast[i] & 31) - (exact[i] & 31));
      const unsigned m = (unsigned)(dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db));
      if (m > maxd) maxd = m;
    }
    cg_upscale320(fast, st.w, st.h, up);
    char path[512];
    snprintf(path, sizeof path, "%s/%s.ppm", argv[2], d->id);
    write_ppm(path, up);
    printf("{\"id\": \"%s\", \"w\": %d, \"h\": %d, \"instance\": \"%s\", \"bound\": %d, \"frame0\": \"%08x\", \"frame0MeanLum\": %.9g, "
           "\"passes\": %u, \"acc\": \"%08x\", \"meanLum\": %.9g, \"ev\": [", d->id, st.w, st.h, instance_for(d)->name, bound, f0, lum0, st.pass, acc, lum);
    for (unsigned i = 0; i < nev; i++) printf("%s%.9g", i ? ", " : "", evs[i]);
    printf("], \"dispFast\": \"%08x\", \"dispExact\": \"%08x\", \"dispCoarse\": \"%08x\", \"pixelsFastExactDiffer\": %u, \"maxChannelStep\": %u, "
           "\"seconds\": %.3f, \"usPerSample\": %.3f}\n",
           cg_fnv(2166136261u, fast, sizeof(uint16_t) * st.w * st.h), cg_fnv(2166136261u, exact, sizeof(uint16_t) * st.w * st.h), coarse_digest,
           differ, maxd, secs, 1e6 * secs / ((double)st.samples));
    fflush(stdout);
  }
  cg_free_all(&st);
  return 0;
}
#endif
