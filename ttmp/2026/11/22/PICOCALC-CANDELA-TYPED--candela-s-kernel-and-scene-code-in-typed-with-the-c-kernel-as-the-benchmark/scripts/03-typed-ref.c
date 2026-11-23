/* 03-typed-ref.c: the Typed arm's reference digests through the gallery's own renderer core (PICOCALC-CANDELA-TYPED).
 *
 *   typed-ref PASSES DUMPDIR ID ...   one JSON line per scene: frame0, acc, disp, as the device's "gallery digest ID
 *                                     PASSES psram typed" prints them
 *
 * DUMPDIR/ID.typed.f32 holds the Typed program's pixel outputs (12 floats each, row-major) for passes 0..PASSES-1,
 * written by 03-typed-dump.mjs from its WebAssembly build (bit-identical to its RV32 build). A replay instance hands
 * them to nucleus/candela_gallery.c, which renders the progressive passes, meters and displays exactly as on the
 * device (cg_advance, cg_display CG_FAST), so the display digest includes the core's exposure and tone map. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "candela_gallery.h"

static float *dump;
static int W, H;
static void replay_span(int y, int x0, int x1, unsigned frame, cdl_pixout *out) {
  const unsigned pass = frame == 0 ? 0 : frame - 1;
  memcpy(out, dump + 12 * ((size_t)pass * W * H + (size_t)y * W + x0), sizeof(cdl_pixout) * (size_t)(x1 - x0));
}
static int bind(const cdl_buffers *b, const void *s, void *sky) { (void)b; (void)s; (void)sky; return 1; }
static unsigned sky_bytes(void) { return 0; }
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
