// harness.cpp: PICOCALC-CANDELA-P4's 05-harness.cpp with the section interpreter behind the five dispatch functions.
//
// Build with -DKERNEL="kernel.cpp" (04-wgsl2cpp.mjs output rewritten by rewrite-kernel.py) and -DMODE:
//   MODE=0  compiled   the dispatch functions are the compiled C++ translation of the sections (the reference)
//   MODE=1  vm         the dispatch functions run the bytecode through cdl_vm.c
//   MODE=2  compare    both run on every evaluation; the compiled result is returned, so the frame follows the compiled
//                      path, and every evaluation is compared (design Section 8). Host only.
// Host: harness scene.bin prog.cdvm out.rgbf [stats.json]. RV32 (counting interpreter): the scene and program are
// linked with .incbin; the frame is counted between region marks (system call 500 of rv32imfc-count.c).
#ifndef KERNEL
#error "build with -DKERNEL=\"path/kernel.cpp\""
#endif
#ifndef MODE
#define MODE 0
#endif
#include KERNEL
#include "cdl_vm.h"
#include <stddef.h>
#include <string.h>

namespace cdl {
static const float *gU, *gO, *gL, *gB, *gS;
static unsigned gNU;
static inline vec4f row(const float *p, i32 i) { p += 4 * i; return vec4f(p[0], p[1], p[2], p[3]); }
static vec4f U(i32 i) { return row(gU, i); }
static vec4f objF(i32 i) { return row(gO, i); }
static vec4f litF(i32 i) { return row(gL, i); }
static vec4f bvhF(i32 i) { return row(gB, i); }
static vec4f sdF(i32 i) { return row(gS, i); }
static void bind(const unsigned *blob) {
  const unsigned *n = blob + 1;                 // [magic, nU, nO, nLI, nBV, nSD]
  const float *p = (const float *)(blob + 6);
  gNU = n[0];
  gU = p; p += 4 * n[0]; gO = p; p += 4 * n[1]; gL = p; p += 4 * n[2]; gB = p; p += 4 * n[3]; gS = p;
}
} // namespace cdl

// ---- the kernel table: C entry points onto the prototype's kernel functions ----
static_assert(sizeof(cdl::Hit) == sizeof(cdl_hit) && offsetof(cdl::Hit, mat) == offsetof(cdl_hit, mat) && offsetof(cdl::Hit, front) == offsetof(cdl_hit, front)
  && offsetof(cdl::Hit, irand) == offsetof(cdl_hit, irand) && offsetof(cdl::Hit, uv) == offsetof(cdl_hit, uv) && offsetof(cdl::Hit, face) == offsetof(cdl_hit, face), "Hit layout");
static_assert(sizeof(cdl::Lobe) == sizeof(cdl_lobe) && offsetof(cdl::Lobe, flags) == offsetof(cdl_lobe, flags) && offsetof(cdl::Lobe, film) == offsetof(cdl_lobe, film)
  && offsetof(cdl::Lobe, med) == offsetof(cdl_lobe, med) && offsetof(cdl::Lobe, T) == offsetof(cdl_lobe, T), "Lobe layout");
namespace adapt {
using namespace cdl;
static inline vec3f V3(const float *p) { return vec3f(p[0], p[1], p[2]); }
static inline void W3(float *o, vec3f v) { o[0] = v.x; o[1] = v.y; o[2] = v.z; }
static float fresnel(float c, float e) { return fresnelDielectric(c, e); }
static float noise(const float *p) { return noise3(V3(p)); }
static float fbm(const float *p, int oct, float lac, float gain, int mode) { return fbm3(V3(p), oct, lac, gain, mode); }
static void voronoi(const float *p, float *o) { const vec4f v = voronoi3(V3(p)); o[0] = v.x; o[1] = v.y; o[2] = v.z; o[3] = v.w; }
static void tangent(const cdl_hit *h, const float *tl, float rot, const float *N, float *o) { W3(o, tangentWorld(*(const Hit *)h, V3(tl), rot, V3(N))); }
static float sell(float lam, const float *B, const float *C) { return sellmeier(lam, V3(B), V3(C)); }
static void trace(const float *ro, const float *rd, float tmax, cdl_hit *o) { const Hit h = traceScene(V3(ro), V3(rd), tmax); memcpy(o, &h, sizeof h); }
static int occl(const float *ro, const float *rd, float tmax) { return occluded(V3(ro), V3(rd), tmax) ? 1 : 0; }
static void alb(const cdl_hit *h, const float *wo, float *o) { W3(o, hitAlbedo(*(const Hit *)h, V3(wo))); }
static void emis(const cdl_hit *h, const float *wo, float *o) { W3(o, hitEmission(*(const Hit *)h, V3(wo))); }
static float h13(const float *p) { return hash13(V3(p)); }
static void vvec(const float *p, float *o) { W3(o, voronoiVec3(V3(p))); }
static void envsun(const float *d, float *o) { W3(o, envL(V3(d)) + sunL(V3(d))); }
static float rnd1() { return rnd(); }
static void rndv2(float *o) { const vec2f v = rnd2(); o[0] = v.x; o[1] = v.y; }
static void coshemi(const float *N, float *o) { W3(o, toWorld(frameOf(V3(N)), cosHemi(rnd2()))); }
} // namespace adapt
static const cdl_vm_kernel KT = { adapt::fresnel, adapt::noise, adapt::fbm, adapt::voronoi, adapt::tangent, adapt::sell, adapt::trace, adapt::occl,
  adapt::alb, adapt::emis, adapt::h13, adapt::vvec, adapt::envsun, adapt::rnd1, adapt::rndv2, adapt::coshemi, &cdl::gTime, &cdl::gLam };
static cdl_vm_program PROG;
static cdl_vm_ctx CTX;
static cdl_vm_word REGS[CDL_VM_REG_LIMIT];

// ---- compare mode: per-evaluation agreement (design Section 8) ----
#if MODE == 2
#include <math.h>
#include <stdio.h>
struct Stat { unsigned long long n = 0, bitExact = 0, over = 0, intMismatch = 0, rngMismatch = 0; double maxRel = 0; char worst[512] = ""; };
static Stat ST[5];
static const char *ENAME[5] = {"evalMaterial", "sdUser", "heightAt", "densityOf", "customKernel"};
// max |a - b| over the components, divided by the larger of the two vectors' max-norms (0 when equal, inf for one NaN)
static double relv(const float *a, const float *b, int n) {
  double num = 0, den = 0;
  for (int i = 0; i < n; i++) {
    const bool na = a[i] != a[i], nb = b[i] != b[i];
    if (na || nb) { if (na && nb) continue; return INFINITY; }
    num = fmax(num, fabs((double)a[i] - (double)b[i])); den = fmax(den, fmax(fabs((double)a[i]), fabs((double)b[i])));
  }
  return num == 0 ? 0 : num / den;
}
static void note(int e, double rel, bool intOk, bool rngOk, bool bits, const char *what) {
  Stat &s = ST[e];
  s.n++; if (bits) s.bitExact++; if (!intOk) s.intMismatch++; if (!rngOk) s.rngMismatch++;
  if (rel > 1e-5 || !intOk) s.over++;
  if (rel > s.maxRel || (!intOk && !s.worst[0])) { if (rel > s.maxRel) s.maxRel = rel; snprintf(s.worst, sizeof s.worst, "%s", what); }
}
static void report(FILE *f) {
  for (int e = 0; e < 5; e++) {
    const Stat &s = ST[e];
    fprintf(f, "{\"entry\": \"%s\", \"evaluations\": %llu, \"bitExact\": %llu, \"over1e-5\": %llu, \"intMismatch\": %llu, \"rngMismatch\": %llu, \"maxRel\": %.3g, \"worst\": \"%s\"}\n",
            ENAME[e], s.n, s.bitExact, s.over, s.intMismatch, s.rngMismatch, s.maxRel, s.worst);
  }
}
#endif

namespace cdl {
static Lobe evalMaterial(const Hit &h, vec3f wo, f32 u) {
#if MODE == 0
  return evalMaterial_compiled(h, wo, u);
#elif MODE == 1
  Lobe L; cdl_vm_eval_material(&CTX, (const cdl_hit *)&h, &wo.x, u, (cdl_lobe *)&L); return L;
#else
  const u32 s0 = rngS; const Lobe A = evalMaterial_compiled(h, wo, u); const u32 s1 = rngS; rngS = s0;
  Lobe B; cdl_vm_eval_material(&CTX, (const cdl_hit *)&h, &wo.x, u, (cdl_lobe *)&B); const u32 s2 = rngS; rngS = s1;
  const float *a = (const float *)&A, *b = (const float *)&B;
  static const int F[][2] = {{1, 3}, {4, 3}, {7, 1}, {8, 1}, {9, 1}, {11, 3}, {14, 3}, {17, 3}, {20, 2}, {23, 3}};   // float fields (offset, width)
  static const char *FN[] = {"c0", "c1", "ax", "ay", "ior", "N", "w", "Le", "film", "T"};
  double rel = 0; int wf = 0; for (int i = 0; i < 10; i++) { const double r = relv(a + F[i][0], b + F[i][0], F[i][1]); if (r > rel) { rel = r; wf = i; } }
  const bool intOk = A.kind == B.kind && A.flags == B.flags && A.med == B.med;
  const float *fa = a + F[wf][0], *fb = b + F[wf][0];
  char w[512]; snprintf(w, sizeof w, "mat %d P=(%g %g %g) N=(%g %g %g) wo=(%g %g %g) u=%.9g kind %d/%d flags %d/%d rel %.3g in %s: (%.9g %.9g %.9g) / (%.9g %.9g %.9g)", h.mat, h.P.x, h.P.y, h.P.z, h.N.x, h.N.y, h.N.z, wo.x, wo.y, wo.z, u, A.kind, B.kind, A.flags, B.flags, rel,
    FN[wf], fa[0], F[wf][1] > 1 ? fa[1] : 0.0f, F[wf][1] > 2 ? fa[2] : 0.0f, fb[0], F[wf][1] > 1 ? fb[1] : 0.0f, F[wf][1] > 2 ? fb[2] : 0.0f);
  note(0, rel, intOk, s1 == s2, memcmp(&A, &B, sizeof A) == 0, w);
  return A;
#endif
}
#if MODE == 2
static void noteScalar(int e, f32 A, f32 B, int k, const float *p, int n) {
  char w[256]; snprintf(w, sizeof w, "k %d p=(%g %g %g) %.9g / %.9g", k, p[0], n > 1 ? p[1] : 0.0, n > 2 ? p[2] : 0.0, A, B);
  note(e, relv(&A, &B, 1), true, true, memcmp(&A, &B, 4) == 0, w);
}
#endif
static f32 sdUser(i32 k, vec3f p) {
#if MODE == 0
  return sdUser_compiled(k, p);
#elif MODE == 1
  return cdl_vm_sd_user(&CTX, k, &p.x);
#else
  const f32 A = sdUser_compiled(k, p), B = cdl_vm_sd_user(&CTX, k, &p.x); noteScalar(1, A, B, k, &p.x, 3); return A;
#endif
}
static f32 heightAt(i32 k, vec2f xz) {
#if MODE == 0
  return heightAt_compiled(k, xz);
#elif MODE == 1
  return cdl_vm_height_at(&CTX, k, &xz.x);
#else
  const f32 A = heightAt_compiled(k, xz), B = cdl_vm_height_at(&CTX, k, &xz.x); noteScalar(2, A, B, k, &xz.x, 2); return A;
#endif
}
static f32 densityOf(i32 m, vec3f P) {
#if MODE == 0
  return densityOf_compiled(m, P);
#elif MODE == 1
  return cdl_vm_density_of(&CTX, m, &P.x);
#else
  const f32 A = densityOf_compiled(m, P), B = cdl_vm_density_of(&CTX, m, &P.x); noteScalar(3, A, B, m, &P.x, 3); return A;
#endif
}
static vec3f customKernel(vec3f ro, vec3f rd) {
#if MODE == 0
  return customKernel_compiled(ro, rd);
#elif MODE == 1
  vec3f o; cdl_vm_custom_kernel(&CTX, &ro.x, &rd.x, &o.x); return o;
#else
  const u32 s0 = rngS; const vec3f A = customKernel_compiled(ro, rd); const u32 s1 = rngS; rngS = s0;
  vec3f B; cdl_vm_custom_kernel(&CTX, &ro.x, &rd.x, &B.x); const u32 s2 = rngS; rngS = s1;
  char w[256]; snprintf(w, sizeof w, "ro=(%g %g %g) rd=(%g %g %g) (%g %g %g) / (%g %g %g)", ro.x, ro.y, ro.z, rd.x, rd.y, rd.z, A.x, A.y, A.z, B.x, B.y, B.z);
  note(4, relv(&A.x, &B.x, 3), true, s1 == s2, memcmp(&A, &B, sizeof A) == 0, w);
  return A;
#endif
}
} // namespace cdl
using namespace cdl;

#ifndef SPP
#define SPP 1
#endif
static float line[4096 * 3];

#ifdef __riscv
extern "C" const unsigned cdl_scene[];
extern "C" const unsigned char cdl_prog[], cdl_prog_end[];
static void emit(const void *p, unsigned n) {
  register long a0 asm("a0") = 1, a1 asm("a1") = (long)p, a2 asm("a2") = n, a7 asm("a7") = 64;
  asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
}
static void mark(long what, long tag) {
  register long a0 asm("a0") = what, a1 asm("a1") = tag, a7 asm("a7") = 500;
  asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a7) : "memory");
}
static void fatal(const char *m) { emit(m, (unsigned)strlen(m)); register long a0 asm("a0") = 3, a7 asm("a7") = 93; asm volatile("ecall" : : "r"(a0), "r"(a7)); for (;;) {} }
extern "C" int main();
extern "C" __attribute__((naked, section(".text.start"))) void _start() {
  asm volatile("call main\n li a7, 93\n ecall\n");
}
extern "C" int main() {
  bind(cdl_scene);
  const void *blob = cdl_prog; const size_t blobLen = (size_t)(cdl_prog_end - cdl_prog);
#else
#include <stdio.h>
#include <stdlib.h>
static FILE *fout;
static void emit(const void *p, unsigned n) { fwrite(p, 1, n, fout); }
static void mark(long, long) {}
static void fatal(const char *m) { fprintf(stderr, "harness: %s\n", m); exit(3); }
static void *slurp(const char *path, size_t *len) {
  FILE *f = fopen(path, "rb"); if (!f) { fprintf(stderr, "harness: cannot open %s\n", path); exit(2); }
  fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
  void *b = aligned_alloc(16, ((size_t)n + 15) & ~(size_t)15); if (fread(b, 1, n, f) != (size_t)n) exit(2); fclose(f); *len = (size_t)n; return b;
}
int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: harness scene.bin prog.cdvm out.rgbf [stats.json]\n"); return 2; }
  size_t sceneLen, blobLen;
  bind((const unsigned *)slurp(argv[1], &sceneLen));
  const void *blob = slurp(argv[2], &blobLen);
  fout = fopen(argv[3], "wb");
#endif
  char err[CDL_VM_ERRLEN];
  if (cdl_vm_load(&PROG, blob, blobLen, &KT, err, sizeof err)) fatal(err);
  if (cdl_vm_regs_bytes(&PROG) > sizeof REGS) fatal("register file too small");
  if (cdl_vm_bind(&CTX, &PROG, &KT, REGS, gU, gNU, err, sizeof err)) fatal(err);
  const i32 W = i32(U(0).x), H = i32(U(0).y);
  mark(1, 0);
  for (i32 y = 0; y < H; y++) {
    for (i32 x = 0; x < W; x++) {
      vec3f acc(0.0f);
      for (u32 s = 0; s < SPP; s++) { const PixOut o = renderPixel(vec2f(f32(x), f32(y)), s); acc = acc + vec3f(o.c.x, o.c.y, o.c.z); }
      line[3 * x] = acc.x / SPP; line[3 * x + 1] = acc.y / SPP; line[3 * x + 2] = acc.z / SPP;
    }
    mark(0, 0);
    emit(line, 12 * W);
    mark(1, 0);
  }
  mark(0, 0);
  mark(2, MODE);
#ifndef __riscv
  fclose(fout);
#if MODE == 2
  FILE *sf = argc > 4 ? fopen(argv[4], "w") : stderr; report(sf); if (sf != stderr) fclose(sf);
#endif
#ifdef CDL_VM_COUNT
  fprintf(stderr, "{\"vmSteps\": %llu, \"samples\": %d}\n", CTX.steps, W * H * SPP);
#endif
#endif
  return 0;
}
