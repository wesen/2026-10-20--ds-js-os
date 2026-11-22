// cdl_vm_sections.cpp: the section bytecode as a Sections table of a PICOCALC-CANDELA-CPU-KERNEL kernel instance.
//
// Compile once per kernel instance, with the instance's defines (-DCDL_NS=<ns>, its CDL_* switches) and the kernel's
// include paths (cpu/, generated/). Exports, with C linkage:
//   const Sections <ns>_sections_vm      pass to <ns>_bind in place of a compiled scene's <ns>_sections_<ID>
//   int <ns>_vm_load(const void *blob, size_t len, const float *U, unsigned nU, char *err, size_t errlen)
//        verify the bytecode against this instance's section API and bind it to the uniform rows U (the same rows
//        <ns>_bind receives); 0 on success, otherwise err says why. Call it when the scene changes; call
//        <ns>_vm_rebind_uniforms(U) when only uniform rows change (time, camera).
//   float cdl_vm_k_floorf/sinf/cosf/expf(float)   the instance's floor, sin, cos and exp (cdl_math.h, which the
//        CDL_FAST_* switches change), for cdl_vm.c compiled with -include cdl_vm_ck_math.h. Define
//        CDL_VM_NO_MATH_EXPORTS in all but one instance of a binary whose instances share these switches.
//
// The nine section-API functions the bytecode calls go through the instance's api:: functions; lobeNone, lum,
// metalAt, safeNorm, fmodp and fmodp3 are translated into bytecode. The functions beyond the section API stay NULL,
// so a program that needs them is refused by <ns>_vm_load.
#include <stddef.h>
#include <string.h>
#include "cdl_kernel.h"
extern "C" {
#include "cdl_vm.h"
}

namespace CDL_NS {
// The interpreter reads and writes Hit and Lobe through cdl_hit and cdl_lobe: the layouts must be the same.
#define CDL_VM_SAME(T, C, f) static_assert(offsetof(T, f) == offsetof(C, f), #T "." #f " is not where " #C "." #f " is");
static_assert(sizeof(Hit) == sizeof(cdl_hit) && sizeof(Lobe) == sizeof(cdl_lobe), "Hit or Lobe differs in size from the interpreter's");
CDL_VM_SAME(Hit, cdl_hit, ok) CDL_VM_SAME(Hit, cdl_hit, t) CDL_VM_SAME(Hit, cdl_hit, P) CDL_VM_SAME(Hit, cdl_hit, N) CDL_VM_SAME(Hit, cdl_hit, Ng)
CDL_VM_SAME(Hit, cdl_hit, uv) CDL_VM_SAME(Hit, cdl_hit, lp) CDL_VM_SAME(Hit, cdl_hit, obj) CDL_VM_SAME(Hit, cdl_hit, mat) CDL_VM_SAME(Hit, cdl_hit, lit)
CDL_VM_SAME(Hit, cdl_hit, front) CDL_VM_SAME(Hit, cdl_hit, irand) CDL_VM_SAME(Hit, cdl_hit, iid) CDL_VM_SAME(Hit, cdl_hit, face)
CDL_VM_SAME(Lobe, cdl_lobe, kind) CDL_VM_SAME(Lobe, cdl_lobe, c0) CDL_VM_SAME(Lobe, cdl_lobe, c1) CDL_VM_SAME(Lobe, cdl_lobe, ax) CDL_VM_SAME(Lobe, cdl_lobe, ay)
CDL_VM_SAME(Lobe, cdl_lobe, ior) CDL_VM_SAME(Lobe, cdl_lobe, flags) CDL_VM_SAME(Lobe, cdl_lobe, N) CDL_VM_SAME(Lobe, cdl_lobe, w) CDL_VM_SAME(Lobe, cdl_lobe, Le)
CDL_VM_SAME(Lobe, cdl_lobe, film) CDL_VM_SAME(Lobe, cdl_lobe, med) CDL_VM_SAME(Lobe, cdl_lobe, T)
#undef CDL_VM_SAME

namespace vmsec {
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
static cdl_vm_word regs[CDL_VM_REG_LIMIT];

static Lobe evalMaterial(const Hit &h, vec3f wo, f32 u) {
  Lobe L;
  cdl_vm_eval_material(&ctx, reinterpret_cast<const cdl_hit *>(&h), &wo.x, u, reinterpret_cast<cdl_lobe *>(&L));
  return L;
}
static f32 sdUser(i32 k, vec3f p) { return cdl_vm_sd_user(&ctx, k, &p.x); }
static f32 heightAt(i32 k, vec2f xz) { return cdl_vm_height_at(&ctx, k, &xz.x); }
static f32 densityOf(i32 m, vec3f P) { return cdl_vm_density_of(&ctx, m, &P.x); }
static vec3f customKernel(vec3f ro, vec3f rd) { vec3f o; cdl_vm_custom_kernel(&ctx, &ro.x, &rd.x, &o.x); return o; }
}  // namespace vmsec
}  // namespace CDL_NS

extern "C" const CDL_NS::Sections CDL_C(sections_vm) = {
  &CDL_NS::vmsec::evalMaterial, &CDL_NS::vmsec::sdUser, &CDL_NS::vmsec::heightAt, &CDL_NS::vmsec::densityOf, &CDL_NS::vmsec::customKernel
};

extern "C" int CDL_C(vm_load)(const void *blob, size_t len, const float *U, unsigned nU, char *err, size_t errlen) {
  using namespace CDL_NS::vmsec;
  if (cdl_vm_load(&prog, blob, len, &KERNEL, err, errlen)) return 1;
  if (((prog.flags & 1) != 0) != (CDL_SPECTRAL != 0)) {
    if (err && errlen) { strncpy(err, CDL_SPECTRAL ? "the program is RGB, the kernel instance spectral" : "the program is spectral, the kernel instance RGB", errlen - 1); err[errlen - 1] = 0; }
    return 1;
  }
  if (cdl_vm_regs_bytes(&prog) > sizeof regs) {
    if (err && errlen) { strncpy(err, "register file larger than the instance's buffer", errlen - 1); err[errlen - 1] = 0; }
    return 1;
  }
  return cdl_vm_bind(&ctx, &prog, &KERNEL, regs, U, nU, err, errlen) ? 1 : 0;
}
extern "C" void CDL_C(vm_rebind_uniforms)(const float *U) { cdl_vm_rebind_uniforms(&CDL_NS::vmsec::ctx, U); }
extern "C" unsigned long long CDL_C(vm_steps)(void) { return CDL_NS::vmsec::ctx.steps; }

#ifndef CDL_VM_NO_MATH_EXPORTS
extern "C" float cdl_vm_k_floorf(float x) { return CDL_NS::floor(x); }
extern "C" float cdl_vm_k_sinf(float x) { return CDL_NS::sin(x); }
extern "C" float cdl_vm_k_cosf(float x) { return CDL_NS::cos(x); }
extern "C" float cdl_vm_k_expf(float x) { return CDL_NS::exp(x); }
#endif
