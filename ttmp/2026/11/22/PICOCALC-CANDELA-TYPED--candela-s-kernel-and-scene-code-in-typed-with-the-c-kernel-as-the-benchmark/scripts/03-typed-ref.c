/* 03-typed-ref.c: the Typed arm's reference digests through the gallery's own renderer core (PICOCALC-CANDELA-TYPED).
 *
 *   typed-ref PASSES DUMPDIR ID ...   one JSON line per scene: frame0, acc, disp, as the device's "gallery digest ID
 *                                     PASSES psram typed" prints them
 *
 * DUMPDIR/ID.typed.f32 holds the Typed program's pixel outputs (12 floats each, row-major) for passes 0..PASSES-1,
 * written by 03-typed-dump.mjs from its WebAssembly build (bit-identical to its RV32 build). A replay instance hands
 * them to nucleus/candela_gallery.c, which renders the progressive passes, meters and displays exactly as on the
 * device (cg_advance, cg_display CG_FAST), so the display digest includes the core's exposure and tone map.
 *
 * Built for rv32 (-DREF_SCENE=<index> -DREF_PASSES=<n> -DREF_DUMP="path"), the dump is linked into the ELF and the
 * replay runs in PICOCALC-CANDELA-SECTIONS' counting interpreter with newlib, as PICOCALC-CANDELA-GALLERY's C++
 * reference does: the display pass calls libm, so only an RV32 newlib build gives the device's display digest.
 * Prints "frame0 <hex>", "acc <hex>", "disp <hex>" on fd 2. */
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include "candela_gallery.h"

static float *dump;
static int W, H;
static void replay_span(int y, int x0, int x1, unsigned frame, cdl_pixout *out);
static int bind(const cdl_buffers *b, const void *s, void *sky);
static unsigned sky_bytes(void);

#ifdef __riscv
#define STR_(x) #x
#define STR(x) STR_(x)
__asm__(".section .rodata\n.balign 16\n.global ref_dump\nref_dump:\n.incbin \"" REF_DUMP "\"\n.previous\n");
extern float ref_dump[];
static uint8_t heap[3 << 20] __attribute__((aligned(16)));
static size_t used;
static void *bump(size_t n) { n = (n + 15) & ~(size_t)15; if (used + n > sizeof heap) return NULL; void *p = heap + used; used += n; return p; }
static void nofree(void *p) { (void)p; }
static long sys(long n, long a, long b, long c) {
  register long a0 asm("a0") = a, a1 asm("a1") = b, a2 asm("a2") = c, a7 asm("a7") = n;
  asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
  return a0;
}
static void put(const char *s) { sys(64, 2, (long)s, (long)strlen(s)); }
static void line(const char *tag, uint32_t v) {
  char s[48]; strcpy(s, tag); size_t n = strlen(s); s[n++] = ' ';
  for (int k = 7; k >= 0; k--) { s[n + k] = "0123456789abcdef"[v & 15]; v >>= 4; }
  strcpy(s + n + 8, "\n"); put(s);
}
int *__errno(void) { static int e; return &e; }
int main(void);
__attribute__((naked, section(".text.start"))) void _start(void) { asm volatile("call main\n li a7, 93\n ecall\n"); }
static const cg_instance replay1[2] = {
  {"typed-replay", 0, bind, sky_bytes, replay_span, NULL, NULL, NULL, NULL, NULL},
  {"typed-replay-spectral", 1, bind, sky_bytes, replay_span, NULL, NULL, NULL, NULL, NULL},
};
static cdl_pixout line_[CG_MAX_SIDE];
static uint16_t disp_[CG_MAX_SIDE * CG_MAX_SIDE];
static cg_state st_;
int main(void) {
  const cg_alloc a = {bump, bump, nofree};
  const cg_scene_desc *d = &cg_scenes[REF_SCENE];
  char err[160];
  dump = ref_dump; W = d->w; H = d->h;
  if (cg_begin(&st_, d, &replay1[d->spectral ? 1 : 0], &a, err, sizeof err)) { put("begin: "); put(err); put("\n"); return 5; }
  line("frame0", cg_frame0_digest(&st_, line_, NULL));
  while (st_.pass < REF_PASSES) cg_advance(&st_);
  line("acc", cg_acc_digest(&st_, NULL));
  cg_display(&st_, disp_, CG_FAST);
  line("disp", cg_fnv(2166136261u, disp_, sizeof(uint16_t) * st_.w * st_.h));
  return 0;
}
#else
#include <stdio.h>
#include <stdlib.h>
#endif
static void replay_span(int y, int x0, int x1, unsigned frame, cdl_pixout *out) {
  const unsigned pass = frame == 0 ? 0 : frame - 1;
  memcpy(out, dump + 12 * ((size_t)pass * W * H + (size_t)y * W + x0), sizeof(cdl_pixout) * (size_t)(x1 - x0));
}
static int bind(const cdl_buffers *b, const void *s, void *sky) { (void)b; (void)s; (void)sky; return 1; }
static unsigned sky_bytes(void) { return 0; }
#ifndef __riscv
static const cg_instance replay[2] = {
  {"typed-replay", 0, bind, sky_bytes, replay_span, NULL, NULL, NULL, NULL, NULL},
  {"typed-replay-spectral", 1, bind, sky_bytes, replay_span, NULL, NULL, NULL, NULL, NULL},
};
static void *big(size_t n) { return aligned_alloc(16, (n + 15) & ~(size_t)15); }

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: typed-ref PASSES DUMPDIR ID ...\n"); return 2; }
  const unsigned passes = (unsigned)atoi(argv[1]);
  const cg_alloc a = {big, big, free};
  static cdl_pixout line[CG_MAX_SIDE];
  static uint16_t disp[CG_MAX_SIDE * CG_MAX_SIDE];
  cg_state st;
  memset(&st, 0, sizeof st);
  for (int i = 3; i < argc; i++) {
    const cg_scene_desc *d = NULL;
    for (unsigned k = 0; k < cg_nscenes; k++) if (!strcmp(cg_scenes[k].id, argv[i])) d = &cg_scenes[k];
    if (!d) { fprintf(stderr, "no scene %s\n", argv[i]); return 1; }
    char path[512], err[160];
    snprintf(path, sizeof path, "%s/%s.typed.f32", argv[2], d->id);
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); return 1; }
    W = d->w; H = d->h;
    const size_t n = 12 * (size_t)passes * W * H;
    free(dump);
    dump = malloc(4 * n);
    if (fread(dump, 4, n, f) != n) { fprintf(stderr, "%s: short\n", path); return 1; }
    fclose(f);
    if (cg_begin(&st, d, &replay[d->spectral ? 1 : 0], &a, err, sizeof err)) { fprintf(stderr, "%s: %s\n", d->id, err); return 1; }
    const uint32_t f0 = cg_frame0_digest(&st, line, NULL);
    while (st.pass < passes) cg_advance(&st);
    const uint32_t acc = cg_acc_digest(&st, NULL);
    cg_display(&st, disp, CG_FAST);
    printf("{\"target\": \"typed\", \"id\": \"%s\", \"passes\": %u, \"frame0\": \"%08x\", \"acc\": \"%08x\", \"disp\": \"%08x\", \"ev100\": %.9g}\n",
           d->id, passes, f0, acc, cg_fnv(2166136261u, disp, sizeof(uint16_t) * st.w * st.h), st.ev);
    cg_end(&st);
  }
  return 0;
}
#endif
