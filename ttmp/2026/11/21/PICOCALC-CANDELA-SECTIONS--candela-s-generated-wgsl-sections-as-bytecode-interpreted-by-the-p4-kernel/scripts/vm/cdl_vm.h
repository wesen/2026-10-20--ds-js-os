/* cdl_vm.h: the C interface of the section interpreter (PICOCALC-CANDELA-SECTIONS design, Section 7).
 *
 * A Candela scene's generated WGSL sections (materials, user SDFs, heightfields, density fields, custom
 * integrator) arrive on the device as a bytecode blob produced by the JavaScript translator (translator/).
 * The firmware kernel (PICOCALC-CANDELA-CPU-KERNEL) calls the five entry points below from its five dispatch
 * functions; the bytecode calls back into the kernel through the cdl_vm_kernel table.
 *
 * Lifetime and binding:
 *   1. cdl_vm_load() verifies a blob against a kernel table. Nothing in a blob runs before this succeeds. The
 *      program points into the blob, which must stay alive and unchanged while the program is used.
 *   2. cdl_vm_bind() attaches a verified program, the kernel table and a register file (cdl_vm_regs_bytes()
 *      bytes, 4-byte aligned) to a context, writes the constant region, and copies the program's uniform rows
 *      from U (nU rows of four floats). One context per core: the register file is the interpreter's only state.
 *   3. cdl_vm_rebind_uniforms() copies the uniform rows again; call it whenever the renderer rebinds the packed
 *      buffers (every Candela pack(): a slider moved or the clock ticked).
 *   4. The five entry points evaluate the scene's sections. They may be nested (a custom integrator calls
 *      hitAlbedo, which calls the material entry; a traced ray calls sdUser): each entry has its own frame.
 *
 * Records: cdl_hit and cdl_lobe have the layout of the kernel's C++ Hit (23 words) and Lobe (26 words). The
 * adapter that connects a kernel checks this with static_assert, so the interpreter reads the kernel's records
 * in place. A bool member is one byte padded to a word, as GCC lays out C++ bool. */
#ifndef CDL_VM_H
#define CDL_VM_H
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct cdl_hit {
  bool ok; float t; float P[3], N[3], Ng[3], uv[2], lp[3];
  int32_t obj, mat, lit; bool front; float irand, iid; int32_t face;
} cdl_hit;
typedef struct cdl_lobe {
  int32_t kind; float c0[3], c1[3], ax, ay, ior; int32_t flags;
  float N[3], w[3], Le[3], film[2]; int32_t med; float T[3];
} cdl_lobe;

/* Kernel functions the bytecode may call (design Section 7.2). A NULL entry is a function the kernel does not
 * export; cdl_vm_load() refuses a program that calls it. time and lambda point at the kernel's gTime and gLam. */
typedef struct cdl_vm_kernel {
  float (*fresnelDielectric)(float cosIn, float eta);
  float (*noise3)(const float p[3]);
  float (*fbm3)(const float p[3], int oct, float lac, float gain, int mode);
  void  (*voronoi3)(const float p[3], float out[4]);
  void  (*tangentWorld)(const cdl_hit *h, const float tl[3], float rot, const float N[3], float out[3]);
  float (*sellmeier)(float lam, const float B[3], const float C[3]);
  void  (*traceScene)(const float ro[3], const float rd[3], float tmax, cdl_hit *out);
  int   (*occluded)(const float ro[3], const float rd[3], float tmax);
  void  (*hitAlbedo)(const cdl_hit *h, const float wo[3], float out[3]);
  void  (*hitEmission)(const cdl_hit *h, const float wo[3], float out[3]);
  float (*hash13)(const float p[3]);
  void  (*voronoiVec3)(const float p[3], float out[3]);
  void  (*envSun)(const float d[3], float out[3]);        /* envL(d) + sunL(d) */
  float (*rnd)(void);
  void  (*rnd2)(float out[2]);
  void  (*cosHemiN)(const float N[3], float out[3]);      /* toWorld(frameOf(N), cosHemi(rnd2())) */
  const float *time, *lambda;
} cdl_vm_kernel;

typedef union cdl_vm_word { float f; int32_t i; uint32_t u; } cdl_vm_word;

typedef struct cdl_vm_entry_desc { uint16_t pc, end, lo, hi, arg, ret; } cdl_vm_entry_desc;
typedef struct cdl_vm_program {
  uint16_t version, flags, nregs, nconst, nimport, ncode;
  uint32_t kmask;
  cdl_vm_entry_desc entry[5];
  const uint8_t *consts;     /* nconst little-endian words */
  const uint8_t *imports;    /* nimport x { u16 reg, u16 row } */
  const uint16_t *code;      /* ncode halfwords (the blob must be 2-byte aligned) */
} cdl_vm_program;

typedef struct cdl_vm_ctx {
  const cdl_vm_program *p;
  const cdl_vm_kernel *k;
  cdl_vm_word *R;            /* register file */
  const cdl_hit *hit;        /* the material entry's input record while it runs */
  const float *U; unsigned nU;
  unsigned long long steps;  /* instructions executed (only with CDL_VM_COUNT) */
} cdl_vm_ctx;

#define CDL_VM_ERRLEN 160
#define CDL_VM_REG_LIMIT 4096   /* the largest register file a verified program can need (words) */
/* Verify blob[0..len) for kernel k. Returns 0 and fills p, or -1 with a message naming the first violation. */
int    cdl_vm_load(cdl_vm_program *p, const void *blob, size_t len, const cdl_vm_kernel *k, char *err, size_t errlen);
size_t cdl_vm_regs_bytes(const cdl_vm_program *p);
/* Bind a verified program. regs: cdl_vm_regs_bytes(p) bytes. U: the uniform buffer (nU rows of 4 floats).
 * Returns 0, or -1 if an imported uniform row is outside U. */
int    cdl_vm_bind(cdl_vm_ctx *c, const cdl_vm_program *p, const cdl_vm_kernel *k, void *regs,
               const float *U, unsigned nU, char *err, size_t errlen);
void   cdl_vm_rebind_uniforms(cdl_vm_ctx *c, const float *U);

/* The five dispatch functions. */
void   cdl_vm_eval_material(cdl_vm_ctx *c, const cdl_hit *h, const float wo[3], float u, cdl_lobe *out);
float  cdl_vm_sd_user(cdl_vm_ctx *c, int k, const float p[3]);
float  cdl_vm_height_at(cdl_vm_ctx *c, int k, const float xz[2]);
float  cdl_vm_density_of(cdl_vm_ctx *c, int m, const float P[3]);
void   cdl_vm_custom_kernel(cdl_vm_ctx *c, const float ro[3], const float rd[3], float out[3]);

#ifdef __cplusplus
}
#endif
#endif
