/* 05-cpp-ref.c: the C++ kernel arm of the gallery (cg/cgs instances, the section interpreter, the renderer core) on
 * x86-64, writing per scene the frame-0 pixel outputs and the PASSES-pass accumulation as raw floats, so the Typed
 * kernel can be compared with it pixel by pixel (PICOCALC-CANDELA-TYPED; copied to PICOCALC-CANDELA-KERNEL-CODEGEN). Built by 05-build-cpp-ref.py.
 *
 *   cpp-ref PASSES OUTDIR [ID ...]   -> OUTDIR/ID.frame0.f32 (w*h*12 floats), OUTDIR/ID.acc.f32 (w*h*4), one JSON line each */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "candela_gallery.h"

extern const cg_instance cg_gallery, cgs_gallery;
static void *big(size_t n) { return aligned_alloc(16, (n + 15) & ~(size_t)15); }

int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: cpp-ref PASSES OUTDIR [ID ...]\n"); return 2; }
  const unsigned passes = (unsigned)atoi(argv[1]);
  const cg_alloc a = {big, big, free};
  static cdl_pixout line[CG_MAX_SIDE];
  cg_state st;
  memset(&st, 0, sizeof st);
  for (unsigned k = 0; k < cg_nscenes; k++) {
    const cg_scene_desc *d = &cg_scenes[k];
    int want = argc == 3;
    for (int i = 3; i < argc; i++) want |= !strcmp(argv[i], d->id);
    if (!want) continue;
    char err[160], path[512];
    if (cg_begin(&st, d, d->spectral ? &cgs_gallery : &cg_gallery, &a, err, sizeof err)) { printf("{\"id\": \"%s\", \"error\": \"%s\"}\n", d->id, err); continue; }
    snprintf(path, sizeof path, "%s/%s.frame0.f32", argv[2], d->id);
    FILE *f = fopen(path, "wb");
    uint32_t h = 2166136261u;
    for (int y = 0; y < st.h; y++) {
      st.inst->render_span(y, 0, st.w, 0, line);
      fwrite(line, sizeof(cdl_pixout), st.w, f);
      h = cg_fnv(h, line, sizeof(cdl_pixout) * st.w);
    }
    fclose(f);
    while (st.pass < passes) cg_advance(&st);
    snprintf(path, sizeof path, "%s/%s.acc.f32", argv[2], d->id);
    f = fopen(path, "wb");
    fwrite(st.acc, 16, (size_t)st.w * st.h, f);
    fclose(f);
    printf("{\"id\": \"%s\", \"w\": %d, \"h\": %d, \"frame0\": \"%08x\", \"acc\": \"%08x\"}\n", d->id, st.w, st.h, h, cg_acc_digest(&st, NULL));
    fflush(stdout);
  }
  cg_free_all(&st);
  return 0;
}
