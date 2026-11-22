// candela_gallery_instance.cpp: one CPU-KERNEL kernel instance with its section interpreter, as a cg_instance
// (PICOCALC-CANDELA-GALLERY). Compile once per instance with the instance's defines (-DCDL_NS=<ns>, its CDL_*
// switches) and include paths (third_party/candela/kernel, third_party/candela/vm). Exports, with C linkage,
// `const cg_instance <ns>_gallery`.
//
// The interpreter adapter is PICOCALC-CANDELA-SECTIONS' scripts/ck/cdl_vm_sections.cpp with one change: the register
// file is the caller's (cg_begin allocates the program's nregs words in internal RAM) instead of a static 16 KB array,
// which in the firmware would be internal .bss. The kernel table, the layout checks and the binding are the same.
#include <stddef.h>
#include <string.h>
#include "cdl_kernel.h"
extern "C" {
#include "cdl_vm.h"
#include "candela_gallery.h"
}

namespace CDL_NS {
#define CDL_VM_SAME(T, C, f) static_assert(offsetof(T, f) == offsetof(C, f), #T "." #f " is not where " #C "." #f " is");
static_assert(sizeof(Hit) == sizeof(cdl_hit) && sizeof(Lobe) == sizeof(cdl_lobe), "Hit or Lobe differs in size from the interpreter's");
CDL_VM_SAME(Hit, cdl_hit, ok) CDL_VM_SAME(Hit, cdl_hit, t) CDL_VM_SAME(Hit, cdl_hit, P) CDL_VM_SAME(Hit, cdl_hit, N) CDL_VM_SAME(Hit, cdl_hit, Ng)
CDL_VM_SAME(Hit, cdl_hit, uv) CDL_VM_SAME(Hit, cdl_hit, lp) CDL_VM_SAME(Hit, cdl_hit, obj) CDL_VM_SAME(Hit, cdl_hit, mat) CDL_VM_SAME(Hit, cdl_hit, lit)
CDL_VM_SAME(Hit, cdl_hit, front) CDL_VM_SAME(Hit, cdl_hit, irand) CDL_VM_SAME(Hit, cdl_hit, iid) CDL_VM_SAME(Hit, cdl_hit, face)
CDL_VM_SAME(Lobe, cdl_lobe, kind) CDL_VM_SAME(Lobe, cdl_lobe, c0) CDL_VM_SAME(Lobe, cdl_lobe, c1) CDL_VM_SAME(Lobe, cdl_lobe, ax) CDL_VM_SAME(Lobe, cdl_lobe, ay)
CDL_VM_SAME(Lobe, cdl_lobe, ior) CDL_VM_SAME(Lobe, cdl_lobe, flags) CDL_VM_SAME(Lobe, cdl_lobe, N) CDL_VM_SAME(Lobe, cdl_lobe, w) CDL_VM_SAME(Lobe, cdl_lobe, Le)
CDL_VM_SAME(Lobe, cdl_lobe, film) CDL_VM_SAME(Lobe, cdl_lobe, med) CDL_VM_SAME(Lobe, cdl_lobe, T)
#undef CDL_VM_SAME

namespace gallery_vm {
static inline vec3f V3(const float *p) { return vec3f(p[0], p[1], p[2]); }
static inline void put3(float *o, vec3f v) { o[0] = v.x; o[1] = v.y; o[2] = v.z; }
static float fresnel(float c, float eta) { return api::fresnelDielectric(c, eta); }
static float noise3(const float p[3]) { return api::noise3(V3(p)); }
static float fbm3(const float p[3], int oct, float lac, float gain, int mode) { return api::fbm3(V3(p), oct, lac, gain, mode); }
static void voronoi3(const float p[3], float o[4]) { const vec4f r = api::voronoi3(V3(p)); o[0] = r.x; o[1] = r.y; o[2] = r.z; o[3] = r.w; }
static void tangentWorld(const cdl_hit *h, const float tl[3], float rot, const float N[3], float o[3]) {
  put3(o, api::tangentWorld(*reinterpret_cast<const Hit *>(h), V3(tl), rot, V3(N)));
}
static float sellmeier(float lam, const float B[3], const float C[3]) { return api::sellmeier(lam, V3(B), V3(C)); }
static void traceScene(const float ro[3], const float rd[3], float tmax, cdl_hit *o) { const Hit r = api::traceScene(V3(ro), V3(rd), tmax); memcpy(o, &r, sizeof r); }
static int occluded(const float ro[3], const float rd[3], float tmax) { return api::occluded(V3(ro), V3(rd), tmax) ? 1 : 0; }
static void hitAlbedo(const cdl_hit *h, const float wo[3], float o[3]) { put3(o, api::hitAlbedo(*reinterpret_cast<const Hit *>(h), V3(wo))); }

static const cdl_vm_kernel KERNEL = {
  fresnel, noise3, fbm3, voronoi3, tangentWorld, sellmeier, traceScene, occluded, hitAlbedo,
  nullptr /* hitEmission */, nullptr /* hash13 */, nullptr /* voronoiVec3 */, nullptr /* envSun */,
  nullptr /* rnd */, nullptr /* rnd2 */, nullptr /* cosHemiN */, &gTime, &gLam
};
static cdl_vm_program prog;
static cdl_vm_ctx ctx;

static Lobe evalMaterial(const Hit &h, vec3f wo, f32 u) {
  Lobe L;
  cdl_vm_eval_material(&ctx, reinterpret_cast<const cdl_hit *>(&h), &wo.x, u, reinterpret_cast<cdl_lobe *>(&L));
  return L;
}
static f32 sdUser(i32 k, vec3f p) { return cdl_vm_sd_user(&ctx, k, &p.x); }
static f32 heightAt(i32 k, vec2f xz) { return cdl_vm_height_at(&ctx, k, &xz.x); }
static f32 densityOf(i32 m, vec3f P) { return cdl_vm_density_of(&ctx, m, &P.x); }
static vec3f customKernel(vec3f ro, vec3f rd) { vec3f o; cdl_vm_custom_kernel(&ctx, &ro.x, &rd.x, &o.x); return o; }
static const Sections SECTIONS = { &evalMaterial, &sdUser, &heightAt, &densityOf, &customKernel };

static int load(const void *blob, size_t len, const float *U, unsigned nU, void *regs, size_t regs_bytes, char *err, size_t errlen) {
  if (cdl_vm_load(&prog, blob, len, &KERNEL, err, errlen)) return 1;
  if (((prog.flags & 1) != 0) != (CDL_SPECTRAL != 0)) {
    if (err && errlen) { strncpy(err, CDL_SPECTRAL ? "the program is RGB, the kernel instance spectral" : "the program is spectral, the kernel instance RGB", errlen - 1); err[errlen - 1] = 0; }
    return 1;
  }
  if (cdl_vm_regs_bytes(&prog) > regs_bytes) {
    if (err && errlen) { strncpy(err, "register file larger than the buffer given", errlen - 1); err[errlen - 1] = 0; }
    return 1;
  }
  return cdl_vm_bind(&ctx, &prog, &KERNEL, regs, U, nU, err, errlen) ? 1 : 0;
}
}  // namespace gallery_vm
}  // namespace CDL_NS

extern "C" const cg_instance CDL_C(gallery) = {
  CDL_SPECTRAL ? "cpu-spectral" : "cpu", CDL_SPECTRAL,
  CDL_C(bind), CDL_C(sky_bytes), CDL_C(render_span), CDL_C(post_bind), CDL_C(display_px),
  CDL_NS::gallery_vm::load, &CDL_NS::gallery_vm::SECTIONS
};

#ifndef CDL_VM_NO_MATH_EXPORTS
extern "C" float cdl_vm_k_floorf(float x) { return CDL_NS::floor(x); }
extern "C" float cdl_vm_k_sinf(float x) { return CDL_NS::sin(x); }
extern "C" float cdl_vm_k_cosf(float x) { return CDL_NS::cos(x); }
extern "C" float cdl_vm_k_expf(float x) { return CDL_NS::exp(x); }
#endif
