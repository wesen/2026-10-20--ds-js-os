/* cdl_vm.c: verifier and interpreter for Candela section bytecode version 1 (PICOCALC-CANDELA-SECTIONS).
 *
 * Plain C99 plus <math.h>. The opcode table comes from cdl_vm_isa.h, generated from translator/isa.js.
 * Semantics: every instruction computes what the C++ translation of the same WGSL computes (design Section 5.4):
 * min/max are fminf/fmaxf, clamp(x, lo, hi) = min(max(x, lo), hi), mix(a, b, t) = a + (b - a) * t, and the
 * transcendental functions go through the CDL_VM_* macros below, which a firmware build points at the kernel's
 * own choices (for example CPU-KERNEL's CDL_FAST_TRIG polynomials).
 *
 * The verifier (cdl_vm_load) runs once per program and is not reentrant (it uses a static boundary bitmap).
 * The interpreter is reentrant across entries: nested calls use disjoint frames (design Section 4.4). */
#include "cdl_vm.h"
#include "cdl_vm_isa.h"
#include <math.h>
#include <string.h>
#include <stdio.h>

#ifndef CDL_VM_SINF
#define CDL_VM_SINF sinf
#endif
#ifndef CDL_VM_COSF
#define CDL_VM_COSF cosf
#endif
#ifndef CDL_VM_TANF
#define CDL_VM_TANF tanf
#endif
#ifndef CDL_VM_ASINF
#define CDL_VM_ASINF asinf
#endif
#ifndef CDL_VM_ACOSF
#define CDL_VM_ACOSF acosf
#endif
#ifndef CDL_VM_ATANF
#define CDL_VM_ATANF atanf
#endif
#ifndef CDL_VM_ATAN2F
#define CDL_VM_ATAN2F atan2f
#endif
#ifndef CDL_VM_EXPF
#define CDL_VM_EXPF expf
#endif
#ifndef CDL_VM_EXP2F
#define CDL_VM_EXP2F exp2f
#endif
#ifndef CDL_VM_LOGF
#define CDL_VM_LOGF logf
#endif
#ifndef CDL_VM_LOG2F
#define CDL_VM_LOG2F log2f
#endif
#ifndef CDL_VM_POWF
#define CDL_VM_POWF powf
#endif
#ifndef CDL_VM_FLOORF
#define CDL_VM_FLOORF floorf
#endif
#ifndef CDL_VM_CEILF
#define CDL_VM_CEILF ceilf
#endif

_Static_assert(CDL_VM_REG_LIMIT == CDL_VM_MAX_REGS, "cdl_vm.h and cdl_vm_isa.h disagree on the register limit");
_Static_assert(sizeof(cdl_hit) == 4 * CDL_VM_HIT_WORDS, "cdl_hit must be 23 words");
_Static_assert(sizeof(cdl_lobe) == 4 * CDL_VM_LOBE_WORDS, "cdl_lobe must be 26 words");
_Static_assert(offsetof(cdl_hit, mat) == 4 * CDL_HIT_mat && offsetof(cdl_hit, front) == 4 * CDL_HIT_front && offsetof(cdl_hit, face) == 4 * CDL_HIT_face, "cdl_hit layout");
_Static_assert(offsetof(cdl_lobe, flags) == 4 * CDL_LOBE_flags && offsetof(cdl_lobe, med) == 4 * CDL_LOBE_med && offsetof(cdl_lobe, T) == 4 * CDL_LOBE_T, "cdl_lobe layout");

/* ---------------------------------------------------------------- verifier ---- */
static unsigned rd16(const uint8_t *b) { return b[0] | (b[1] << 8); }
static uint32_t rd32(const uint8_t *b) { return b[0] | (b[1] << 8) | ((uint32_t)b[2] << 16) | ((uint32_t)b[3] << 24); }
static int fail(char *err, size_t n, const char *msg, unsigned a, unsigned b) {
  if (err && n) snprintf(err, n, msg, a, b);
  return -1;
}
static const void *kfn(const cdl_vm_kernel *k, unsigned i) {
  const void *const t[CDL_VM_NKFUNC] = {
    (const void *)k->fresnelDielectric, (const void *)k->noise3, (const void *)k->fbm3, (const void *)k->voronoi3,
    (const void *)k->tangentWorld, (const void *)k->sellmeier, (const void *)k->traceScene, (const void *)k->occluded,
    (const void *)k->hitAlbedo, (const void *)k->hitEmission, (const void *)k->hash13, (const void *)k->voronoiVec3,
    (const void *)k->envSun, (const void *)k->rnd, (const void *)k->rnd2, (const void *)k->cosHemiN };
  return i < CDL_VM_NKFUNC ? t[i] : 0;
}

static uint8_t boundary[(CDL_VM_MAX_CODE + 8) / 8];
static uint8_t target[(CDL_VM_MAX_CODE + 8) / 8];
#define BSET(m, i) ((m)[(i) >> 3] |= (uint8_t)(1u << ((i) & 7)))
#define BGET(m, i) (((m)[(i) >> 3] >> ((i) & 7)) & 1)

typedef struct { const cdl_vm_program *p; const cdl_vm_entry_desc *e; unsigned ei; char *err; size_t n; } vctx;

static int width_of(char w, unsigned H, int wide) {
  switch (w) {
    case 'L': return CDL_VM_LOBE_WORDS;
    case 'H': return CDL_VM_HIT_WORDS;
    case 'w': return wide ? (int)H : (int)(H & 7);
    case 'a': return (H & 8) ? 1 : (int)(H & 7);
    case 'b': return (H & 16) ? 1 : (int)(H & 7);
    case 'c': return (H & 32) ? 1 : (int)(H & 7);
    default: return w - '0';
  }
}
/* a register operand: kind 'd'/'x' (inside the frame) or 's' (constants or the frame) */
static int check_reg(vctx *v, unsigned pc, char kind, unsigned reg, int w) {
  const cdl_vm_entry_desc *e = v->e;
  if (w < 1) return fail(v->err, v->n, "bad operand width at pc %u (%u)", pc, (unsigned)w);
  if (kind == 'd' || kind == 'x') {
    if (reg < e->lo || reg + (unsigned)w > e->hi) return fail(v->err, v->n, "destination r%u outside the entry's frame at pc %u", reg, pc);
  } else if (!(reg + (unsigned)w <= v->p->nconst || (reg >= e->lo && reg + (unsigned)w <= e->hi))) {
    return fail(v->err, v->n, "source r%u outside the constants and the entry's frame at pc %u", reg, pc);
  }
  return 0;
}
static int check_target(vctx *v, unsigned pc, unsigned t) {
  if (t <= pc || t >= v->e->end) return fail(v->err, v->n, "jump target %u at pc %u is not forward inside the entry", t, pc);
  BSET(target, t);
  return 0;
}
/* operands from a spec string such as "d1 s3 s1 i i"; returns the number of halfwords consumed or -1 */
static int check_spec(vctx *v, unsigned pc, const uint16_t *ops, unsigned avail, const char *spec, unsigned H, int hkind) {
  unsigned n = 0;
  for (const char *s = spec; *s; ) {
    char kind = s[0], w = s[1];
    if (n >= avail) return fail(v->err, v->n, "instruction at pc %u runs past the entry", pc, 0);
    unsigned x = ops[n++];
    if (kind == 't') { if (check_target(v, pc, x)) return -1; s += 1; }
    else if (kind == 'i') { s += 1; }
    else if (kind == 'h') {
      if (x == CDL_VM_HIT_IN) { if (v->ei != CDL_E_evalMaterial) return fail(v->err, v->n, "the input hit used outside the material entry at pc %u", pc, 0); }
      else if (check_reg(v, pc, 's', x, CDL_VM_HIT_WORDS)) return -1;
      s += 1;
    } else {
      if (check_reg(v, pc, kind, x, width_of(w, H, hkind == 1))) return -1;
      s += 2;
    }
    while (*s == ' ') s++;
  }
  return (int)n;
}

static int verify_entry(vctx *v, const cdl_vm_kernel *k) {
  const cdl_vm_program *p = v->p;
  const cdl_vm_entry_desc *e = v->e;
  const uint16_t *code = p->code;
  unsigned pc = e->pc, last = 0;
  while (pc < e->end) {
    unsigned w0 = code[pc], op = w0 & 255, H = w0 >> 8, avail = e->end - pc - 1;
    const uint16_t *ops = code + pc + 1;
    int n;
    BSET(boundary, pc);
    if (op >= CDL_VM_NOPS) return fail(v->err, v->n, "unknown opcode %u at pc %u", op, pc);
    if (cdl_vm_hkind[op] == 2) { if ((H & 7) < 1 || (H & 7) > 4 || (H & 0xc0)) return fail(v->err, v->n, "bad vector width byte %u at pc %u", H, pc); }
    else if (cdl_vm_hkind[op] == 1) { if (H < 1 || H > CDL_VM_LOBE_WORDS) return fail(v->err, v->n, "bad move width %u at pc %u", H, pc); }
    if (cdl_vm_sig[op]) {
      if (op == CDL_OP_GLD && H > 1) return fail(v->err, v->n, "bad global %u at pc %u", H, pc);
      if (cdl_vm_hkind[op] == 0 && op != CDL_OP_GLD && H) return fail(v->err, v->n, "nonzero immediate byte %u at pc %u", H, pc);
      n = check_spec(v, pc, ops, avail, cdl_vm_sig[op], H, cdl_vm_hkind[op]);
      if (n < 0) return -1;
    } else switch (op) {
      case CDL_OP_SWITCH: {
        if (avail < 2) return fail(v->err, v->n, "truncated SWITCH at pc %u", pc, 0);
        unsigned cases = ops[1];
        if (cases < 1 || cases > 256 || avail < 3 + cases) return fail(v->err, v->n, "bad SWITCH size %u at pc %u", cases, pc);
        if (check_reg(v, pc, 's', ops[0], 1)) return -1;
        for (unsigned i = 0; i <= cases; i++) if (check_target(v, pc, ops[2 + i])) return -1;
        n = 3 + (int)cases;
        break;
      }
      case CDL_OP_GATHER: {
        if (avail < 3 || H < 1 || H > 4) return fail(v->err, v->n, "bad GATHER at pc %u", pc, 0);
        unsigned pat = ops[2], maxc = 0;
        if (pat >> (2 * H)) return fail(v->err, v->n, "bad GATHER pattern %u at pc %u", pat, pc);
        for (unsigned j = 0; j < H; j++) { unsigned c = (pat >> (2 * j)) & 3; if (c > maxc) maxc = c; }
        if (check_reg(v, pc, 'd', ops[0], (int)H) || check_reg(v, pc, 's', ops[1], (int)maxc + 1)) return -1;
        n = 3;
        break;
      }
      case CDL_OP_HLD: {
        if (v->ei != CDL_E_evalMaterial) return fail(v->err, v->n, "HLD outside the material entry at pc %u", pc, 0);
        if (avail < 2 || H < 1 || ops[1] + H > CDL_VM_HIT_WORDS) return fail(v->err, v->n, "bad HLD field at pc %u", pc, 0);
        if (check_reg(v, pc, 'd', ops[0], (int)H)) return -1;
        n = 2;
        break;
      }
      case CDL_OP_HBOOL: {
        if (avail < 3 || H || (ops[2] != CDL_HIT_ok && ops[2] != CDL_HIT_front)) return fail(v->err, v->n, "bad HBOOL at pc %u", pc, 0);
        if (check_reg(v, pc, 'd', ops[0], 1) || check_reg(v, pc, 's', ops[1], CDL_VM_HIT_WORDS)) return -1;
        n = 3;
        break;
      }
      case CDL_OP_LOBE: {
        if (avail < 2 || H) return fail(v->err, v->n, "bad LOBE at pc %u", pc, 0);
        unsigned mask = ops[1];
        if (!mask || mask >= (1u << 13)) return fail(v->err, v->n, "bad LOBE mask %u at pc %u", mask, pc);
        if (check_reg(v, pc, 'd', ops[0], CDL_VM_LOBE_WORDS)) return -1;
        n = 2;
        for (unsigned f = 0; f < 13; f++) if (mask & (1u << f)) {
          if ((unsigned)n >= avail) return fail(v->err, v->n, "truncated LOBE at pc %u", pc, 0);
          if (check_reg(v, pc, 's', ops[n++], cdl_vm_lobe_field[f][1])) return -1;
        }
        break;
      }
      case CDL_OP_CALL: {
        if (H >= CDL_VM_NKFUNC) return fail(v->err, v->n, "unknown kernel function %u at pc %u", H, pc);
        if (!kfn(k, H)) return fail(v->err, v->n, "the kernel does not export function %u (pc %u)", H, pc);
        if (cdl_vm_kcustom[H] && v->ei != CDL_E_customKernel) return fail(v->err, v->n, "kernel function %u outside the custom integrator at pc %u", H, pc);
        n = check_spec(v, pc, ops, avail, cdl_vm_ksig[H], 0, 0);
        if (n < 0) return -1;
        if (H == CDL_K_fbm3 && (ops[4] > 16 || ops[5] > 2)) return fail(v->err, v->n, "fbm3 octaves/mode out of range at pc %u (%u)", pc, ops[4]);
        break;
      }
      default: return fail(v->err, v->n, "opcode %u at pc %u has no decoder", op, pc);
    }
    if (op == CDL_OP_FRESDOT && !k->fresnelDielectric) return fail(v->err, v->n, "the kernel does not export fresnelDielectric (pc %u)", pc, 0);
    last = pc;
    pc += 1 + (unsigned)n;
  }
  if (pc != e->end) return fail(v->err, v->n, "entry %u does not end on an instruction boundary", v->ei, 0);
  if (!cdl_vm_term[code[last] & 255]) return fail(v->err, v->n, "entry %u can run past its end (pc %u)", v->ei, last);
  return 0;
}

int cdl_vm_load(cdl_vm_program *p, const void *blob, size_t len, const cdl_vm_kernel *k, char *err, size_t errlen) {
  const uint8_t *b = (const uint8_t *)blob;
  const unsigned HDR = 20 + 12 * CDL_VM_NENTRY;
  if (!b || len < HDR) return fail(err, errlen, "blob too short (%u bytes)", (unsigned)len, 0);
  if (((uintptr_t)b & 1) != 0) return fail(err, errlen, "blob not 2-byte aligned", 0, 0);
  if (rd32(b) != CDL_VM_MAGIC) return fail(err, errlen, "bad magic %08x", rd32(b), 0);
  memset(p, 0, sizeof *p);
  p->version = (uint16_t)rd16(b + 4); p->flags = (uint16_t)rd16(b + 6); p->nregs = (uint16_t)rd16(b + 8);
  p->nconst = (uint16_t)rd16(b + 10); p->nimport = (uint16_t)rd16(b + 12); p->ncode = (uint16_t)rd16(b + 14); p->kmask = rd32(b + 16);
  if (p->version != CDL_VM_VERSION) return fail(err, errlen, "bytecode version %u, interpreter %u", p->version, CDL_VM_VERSION);
  if (p->flags & ~1u) return fail(err, errlen, "unknown flags %#x", p->flags, 0);
  if (p->nconst > p->nregs || p->nregs > CDL_VM_MAX_REGS) return fail(err, errlen, "bad register counts (%u constants, %u registers)", p->nconst, p->nregs);
  size_t need = HDR + 4u * p->nconst + 4u * p->nimport + 2u * p->ncode;
  if (len != need) return fail(err, errlen, "blob is %u bytes, header describes %u", (unsigned)len, (unsigned)need);
  for (unsigned i = 0; i < CDL_VM_NENTRY; i++) {
    const uint8_t *d = b + 20 + 12 * i;
    cdl_vm_entry_desc *e = &p->entry[i];
    e->pc = (uint16_t)rd16(d); e->end = (uint16_t)rd16(d + 2); e->lo = (uint16_t)rd16(d + 4); e->hi = (uint16_t)rd16(d + 6);
    e->arg = (uint16_t)rd16(d + 8); e->ret = (uint16_t)rd16(d + 10);
    if (!(e->pc < e->end && e->end <= p->ncode)) return fail(err, errlen, "entry %u code range is empty or outside the code", i, 0);
    if (!(e->lo >= p->nconst && e->lo <= e->hi && e->hi <= p->nregs)) return fail(err, errlen, "entry %u frame outside the register file", i, 0);
    if (e->arg < e->lo || e->arg + cdl_vm_entry_args[i] > e->hi || e->ret < e->lo || e->ret + cdl_vm_entry_ret[i] > e->hi)
      return fail(err, errlen, "entry %u argument or result block outside its frame", i, 0);
    for (unsigned j = 0; j < i; j++) {
      const cdl_vm_entry_desc *f = &p->entry[j];
      if (e->pc < f->end && f->pc < e->end) return fail(err, errlen, "entries %u and %u share code", j, i);
      if (e->lo < f->hi && f->lo < e->hi) return fail(err, errlen, "entries %u and %u share registers", j, i);
    }
  }
  p->consts = b + HDR;
  p->imports = p->consts + 4u * p->nconst;
  p->code = (const uint16_t *)(const void *)(p->imports + 4u * p->nimport);
  for (unsigned i = 0; i < p->nimport; i++) {
    unsigned reg = rd16(p->imports + 4 * i);
    if (reg + 4 > p->nconst) return fail(err, errlen, "uniform import %u writes outside the constant region (r%u)", i, reg);
  }
  for (unsigned i = 0; i < CDL_VM_NKFUNC; i++) if ((p->kmask >> i) & 1) if (!kfn(k, i)) return fail(err, errlen, "the program needs kernel function %u, which the kernel does not export", i, 0);
  if (p->kmask >> CDL_VM_NKFUNC) return fail(err, errlen, "unknown kernel functions in the mask %#x", p->kmask, 0);
  memset(boundary, 0, (p->ncode + 8) / 8);
  memset(target, 0, (p->ncode + 8) / 8);
  for (unsigned i = 0; i < CDL_VM_NENTRY; i++) {
    vctx v = { p, &p->entry[i], i, err, errlen };
    if (verify_entry(&v, k)) return -1;
  }
  for (unsigned i = 0; i < p->ncode; i++) if (BGET(target, i) && !BGET(boundary, i)) return fail(err, errlen, "jump into the middle of an instruction (halfword %u)", i, 0);
  return 0;
}

size_t cdl_vm_regs_bytes(const cdl_vm_program *p) { return 4u * p->nregs; }

void cdl_vm_rebind_uniforms(cdl_vm_ctx *c, const float *U) {
  const cdl_vm_program *p = c->p;
  c->U = U;
  for (unsigned i = 0; i < p->nimport; i++) {
    unsigned reg = rd16(p->imports + 4 * i), row = rd16(p->imports + 4 * i + 2);
    memcpy(&c->R[reg], U + 4 * row, 16);
  }
}

int cdl_vm_bind(cdl_vm_ctx *c, const cdl_vm_program *p, const cdl_vm_kernel *k, void *regs, const float *U, unsigned nU, char *err, size_t errlen) {
  for (unsigned i = 0; i < p->nimport; i++) {
    unsigned row = rd16(p->imports + 4 * i + 2);
    if (row >= nU) return fail(err, errlen, "the program reads uniform row %u; the buffer has %u rows", row, nU);
  }
  c->p = p; c->k = k; c->R = (cdl_vm_word *)regs; c->hit = 0; c->nU = nU; c->steps = 0;
  memset(regs, 0, cdl_vm_regs_bytes(p));
  for (unsigned i = 0; i < p->nconst; i++) c->R[i].u = rd32(p->consts + 4 * i);
  cdl_vm_rebind_uniforms(c, U);
  return 0;
}

/* ------------------------------------------------------------- interpreter ---- */
static const cdl_vm_word LOBE_NONE[CDL_VM_LOBE_WORDS] = CDL_VM_LOBE_NONE_INIT;
static inline float smooth(float e0, float e1, float x) { float t = fminf(fmaxf((x - e0) / (e1 - e0), 0.0f), 1.0f); return t * t * (3.0f - 2.0f * t); }
#define cdl_vm_smooth smooth
static inline float fmodp(float a, float b) { return a - b * CDL_VM_FLOORF(a / b); }
static inline float fract_(float a) { return a - CDL_VM_FLOORF(a); }
static inline float sign_(float a) { return a > 0.0f ? 1.0f : a < 0.0f ? -1.0f : 0.0f; }
static inline float step_(float e, float x) { return x >= e ? 1.0f : 0.0f; }
static inline int32_t ftoi(float f) { if (!(f > -2147483648.0f)) return f != f ? 0 : INT32_MIN; if (!(f < 2147483648.0f)) return INT32_MAX; return (int32_t)f; }

#ifdef CDL_VM_COUNT
#define COUNT() (c->steps++)
#else
#define COUNT() ((void)0)
#endif

#define F(i) (R[i].f)
#define NEXT(n) do { ip += (n); goto dispatch; } while (0)
#define JUMP(t) do { ip = code + (t); goto dispatch; } while (0)

/* elementwise operations: scalar, vec3 and generic */
#define S2(OP, E) case CDL_OP_##OP: { float a = F(ip[2]), b = F(ip[3]); F(ip[1]) = (E); NEXT(4); }
#define S1(OP, E) case CDL_OP_##OP: { float a = F(ip[2]); F(ip[1]) = (E); NEXT(3); }
#define S3(OP, E) case CDL_OP_##OP: { float a = F(ip[2]), b = F(ip[3]), cc = F(ip[4]); F(ip[1]) = (E); NEXT(5); }
#define V3_2(OP, E) case CDL_OP_##OP##3: { const unsigned pa = ip[2], pb = ip[3]; float o[3]; \
    for (int q = 0; q < 3; q++) { float a = F(pa + q), b = F(pb + q); o[q] = (E); } F(ip[1]) = o[0]; F(ip[1] + 1) = o[1]; F(ip[1] + 2) = o[2]; NEXT(4); }
#define V3_1(OP, E) case CDL_OP_##OP##3: { const unsigned pa = ip[2]; float o[3]; \
    for (int q = 0; q < 3; q++) { float a = F(pa + q); o[q] = (E); } F(ip[1]) = o[0]; F(ip[1] + 1) = o[1]; F(ip[1] + 2) = o[2]; NEXT(3); }
#define V3_3(OP, E) case CDL_OP_##OP##3: { const unsigned pa = ip[2], pb = ip[3], pc = ip[4]; float o[3]; \
    for (int q = 0; q < 3; q++) { float a = F(pa + q), b = F(pb + q), cc = F(pc + q); o[q] = (E); } F(ip[1]) = o[0]; F(ip[1] + 1) = o[1]; F(ip[1] + 2) = o[2]; NEXT(5); }
/* vec3 with a broadcast scalar: VS (vector op scalar), SV (scalar op vector) */
#define VS3(NAME, E) case CDL_OP_##NAME: { const unsigned pa = ip[2]; const float b = F(ip[3]); float o[3]; \
    for (int q = 0; q < 3; q++) { float a = F(pa + q); o[q] = (E); } F(ip[1]) = o[0]; F(ip[1] + 1) = o[1]; F(ip[1] + 2) = o[2]; NEXT(4); }
#define SV3(NAME, E) case CDL_OP_##NAME: { const float a = F(ip[2]); const unsigned pb = ip[3]; float o[3]; \
    for (int q = 0; q < 3; q++) { float b = F(pb + q); o[q] = (E); } F(ip[1]) = o[0]; F(ip[1] + 1) = o[1]; F(ip[1] + 2) = o[2]; NEXT(4); }
/* generic: width H & 7, broadcast flags 8 (a), 16 (b), 32 (c) */
#define G2(OP, E) case CDL_OP_V##OP: { const unsigned w = H & 7, sa = (H & 8) ? 0 : 1, sb = (H & 16) ? 0 : 1, pa = ip[2], pb = ip[3]; float o[4]; \
    for (unsigned q = 0; q < w; q++) { float a = F(pa + q * sa), b = F(pb + q * sb); o[q] = (E); } for (unsigned q = 0; q < w; q++) F(ip[1] + q) = o[q]; NEXT(4); }
#define G1(OP, E) case CDL_OP_V##OP: { const unsigned w = H & 7, sa = (H & 8) ? 0 : 1, pa = ip[2]; float o[4]; \
    for (unsigned q = 0; q < w; q++) { float a = F(pa + q * sa); o[q] = (E); } for (unsigned q = 0; q < w; q++) F(ip[1] + q) = o[q]; NEXT(3); }
#define G3(OP, E) case CDL_OP_V##OP: { const unsigned w = H & 7, sa = (H & 8) ? 0 : 1, sb = (H & 16) ? 0 : 1, sc = (H & 32) ? 0 : 1, pa = ip[2], pb = ip[3], pc = ip[4]; float o[4]; \
    for (unsigned q = 0; q < w; q++) { float a = F(pa + q * sa), b = F(pb + q * sb), cc = F(pc + q * sc); o[q] = (E); } for (unsigned q = 0; q < w; q++) F(ip[1] + q) = o[q]; NEXT(5); }

#define E_ADD (a + b)
#define E_SUB (a - b)
#define E_MUL (a * b)
#define E_DIV (a / b)
#define E_MIN fminf(a, b)
#define E_MAX fmaxf(a, b)
#define E_POW CDL_VM_POWF(a, b)
#define E_ATAN2 CDL_VM_ATAN2F(a, b)
#define E_STEP step_(a, b)
#define E_FMODP fmodp(a, b)
#define E_NEG (-a)
#define E_ABS fabsf(a)
#define E_FLOOR CDL_VM_FLOORF(a)
#define E_CEIL CDL_VM_CEILF(a)
#define E_FRACT fract_(a)
#define E_SQRT sqrtf(a)
#define E_SIN CDL_VM_SINF(a)
#define E_COS CDL_VM_COSF(a)
#define E_TAN CDL_VM_TANF(a)
#define E_ASIN CDL_VM_ASINF(a)
#define E_ACOS CDL_VM_ACOSF(a)
#define E_ATAN CDL_VM_ATANF(a)
#define E_EXP CDL_VM_EXPF(a)
#define E_EXP2 CDL_VM_EXP2F(a)
#define E_LOG CDL_VM_LOGF(a)
#define E_LOG2 CDL_VM_LOG2F(a)
#define E_SIGN sign_(a)
#define E_CLAMP fminf(fmaxf(a, b), cc)
#define E_MIX (a + (b - a) * cc)
#define E_SMOOTH smooth(a, b, cc)

#define ALL2(X) X(ADD, E_ADD) X(SUB, E_SUB) X(MUL, E_MUL) X(DIV, E_DIV) X(MIN, E_MIN) X(MAX, E_MAX) X(POW, E_POW) X(ATAN2, E_ATAN2) X(STEP, E_STEP) X(FMODP, E_FMODP)
#define ALL1(X) X(NEG, E_NEG) X(ABS, E_ABS) X(FLOOR, E_FLOOR) X(CEIL, E_CEIL) X(FRACT, E_FRACT) X(SQRT, E_SQRT) X(SIN, E_SIN) X(COS, E_COS) X(TAN, E_TAN) \
  X(ASIN, E_ASIN) X(ACOS, E_ACOS) X(ATAN, E_ATAN) X(EXP, E_EXP) X(EXP2, E_EXP2) X(LOG, E_LOG) X(LOG2, E_LOG2) X(SIGN, E_SIGN)
#define ALL3(X) X(CLAMP, E_CLAMP) X(MIX, E_MIX) X(SMOOTH, E_SMOOTH)

static inline float dot3(const cdl_vm_word *R, unsigned a, unsigned b) { return F(a) * F(b) + F(a + 1) * F(b + 1) + F(a + 2) * F(b + 2); }
#define HITP(x) ((x) == CDL_VM_HIT_IN ? c->hit : (const cdl_hit *)(const void *)&R[x])

static void run(cdl_vm_ctx *c, unsigned pc) {
  const uint16_t *const code = c->p->code;
  cdl_vm_word *const R = c->R;
  const cdl_vm_kernel *const k = c->k;
  const uint16_t *ip = code + pc;
  unsigned H;
dispatch:
  COUNT();
  H = ip[0] >> 8;
  switch (ip[0] & 255) {
    case CDL_OP_RET: return;
    case CDL_OP_JMP: JUMP(ip[1]);
    case CDL_OP_BRZ: if (R[ip[1]].i == 0) JUMP(ip[2]); NEXT(3);
    case CDL_OP_BRNZ: if (R[ip[1]].i != 0) JUMP(ip[2]); NEXT(3);
    case CDL_OP_IFLT: if (!(F(ip[1]) < F(ip[2]))) JUMP(ip[3]); NEXT(4);
    case CDL_OP_CHOOSE: {
      const float u = F(ip[1]), v = F(ip[2]);
      if (u < v) { F(ip[1]) = u / fmaxf(v, 1e-6f); NEXT(4); }
      F(ip[1]) = (u - v) / fmaxf(1.0f - v, 1e-6f); JUMP(ip[3]);
    }
    case CDL_OP_CHOOSE0: if (!(F(ip[1]) < F(ip[2]))) JUMP(ip[3]); NEXT(4);
    case CDL_OP_SWITCH: { const uint32_t x = R[ip[1]].u, n = ip[2]; JUMP(x < n ? ip[3 + x] : ip[3 + n]); }
    case CDL_OP_MOV1: R[ip[1]] = R[ip[2]]; NEXT(3);
    case CDL_OP_MOV2: { cdl_vm_word a = R[ip[2]], b = R[ip[2] + 1]; R[ip[1]] = a; R[ip[1] + 1] = b; NEXT(3); }
    case CDL_OP_MOV3: { cdl_vm_word a = R[ip[2]], b = R[ip[2] + 1], d = R[ip[2] + 2]; R[ip[1]] = a; R[ip[1] + 1] = b; R[ip[1] + 2] = d; NEXT(3); }
    case CDL_OP_MOV4: memmove(&R[ip[1]], &R[ip[2]], 16); NEXT(3);
    case CDL_OP_MOVN: memmove(&R[ip[1]], &R[ip[2]], 4u * H); NEXT(3);
    case CDL_OP_SPLAT3: { cdl_vm_word a = R[ip[2]]; R[ip[1]] = a; R[ip[1] + 1] = a; R[ip[1] + 2] = a; NEXT(3); }
    case CDL_OP_GATHER: { cdl_vm_word o[4]; const unsigned s = ip[2], pat = ip[3];
      for (unsigned q = 0; q < H; q++) o[q] = R[s + ((pat >> (2 * q)) & 3)];
      for (unsigned q = 0; q < H; q++) R[ip[1] + q] = o[q];
      NEXT(4); }
    case CDL_OP_HLD: memcpy(&R[ip[1]], (const cdl_vm_word *)(const void *)c->hit + ip[2], 4u * H); NEXT(3);
    case CDL_OP_HBOOL: R[ip[1]].i = *(const uint8_t *)(const void *)&R[ip[2] + ip[3]] != 0; NEXT(4);
    case CDL_OP_GLD: F(ip[1]) = H ? *k->lambda : *k->time; NEXT(2);
    case CDL_OP_LNONE: memcpy(&R[ip[1]], LOBE_NONE, sizeof LOBE_NONE); NEXT(2);
    case CDL_OP_LOBE: {
      cdl_vm_word *L = &R[ip[1]];
      unsigned mask = ip[2];
      const uint16_t *s = ip + 3;
      while (mask) {
        const unsigned f = (unsigned)__builtin_ctz(mask), off = cdl_vm_lobe_field[f][0], w = cdl_vm_lobe_field[f][1];
        const cdl_vm_word *src = &R[*s++];
        L[off] = src[0]; if (w > 1) { L[off + 1] = src[1]; if (w > 2) L[off + 2] = src[2]; }
        mask &= mask - 1;
      }
      ip = s; goto dispatch;
    }
    ALL2(S2) ALL1(S1) ALL3(S3)
    case CDL_OP_FLT: R[ip[1]].i = F(ip[2]) < F(ip[3]); NEXT(4);
    case CDL_OP_FLE: R[ip[1]].i = F(ip[2]) <= F(ip[3]); NEXT(4);
    case CDL_OP_FGT: R[ip[1]].i = F(ip[2]) > F(ip[3]); NEXT(4);
    case CDL_OP_FGE: R[ip[1]].i = F(ip[2]) >= F(ip[3]); NEXT(4);
    case CDL_OP_FEQ: R[ip[1]].i = F(ip[2]) == F(ip[3]); NEXT(4);
    case CDL_OP_FNE: R[ip[1]].i = F(ip[2]) != F(ip[3]); NEXT(4);
    case CDL_OP_SEL: R[ip[1]] = R[ip[2]].i ? R[ip[3]] : R[ip[4]]; NEXT(5);
    V3_2(ADD, E_ADD) V3_2(SUB, E_SUB) V3_2(MUL, E_MUL) V3_2(DIV, E_DIV) V3_2(MIN, E_MIN) V3_2(MAX, E_MAX)
    V3_1(NEG, E_NEG) V3_1(ABS, E_ABS) V3_1(FLOOR, E_FLOOR) V3_1(FRACT, E_FRACT)
    V3_3(CLAMP, E_CLAMP) V3_3(MIX, E_MIX)
    VS3(ADD3S, E_ADD) VS3(SUB3S, E_SUB) VS3(MUL3S, E_MUL) VS3(DIV3S, E_DIV)
    SV3(SSUB3, E_SUB) SV3(SDIV3, E_DIV) SV3(SMUL3, E_MUL) SV3(SADD3, E_ADD)
    case CDL_OP_MIX3S: { const unsigned pa = ip[2], pb = ip[3]; const float cc = F(ip[4]); float o[3];
      for (int q = 0; q < 3; q++) { float a = F(pa + q), b = F(pb + q); o[q] = E_MIX; } F(ip[1]) = o[0]; F(ip[1] + 1) = o[1]; F(ip[1] + 2) = o[2]; NEXT(5); }
    case CDL_OP_DOT3: F(ip[1]) = dot3(R, ip[2], ip[3]); NEXT(4);
    case CDL_OP_CROSS: { const unsigned a = ip[2], b = ip[3];
      const float x = F(a + 1) * F(b + 2) - F(a + 2) * F(b + 1), y = F(a + 2) * F(b) - F(a) * F(b + 2), z = F(a) * F(b + 1) - F(a + 1) * F(b);
      F(ip[1]) = x; F(ip[1] + 1) = y; F(ip[1] + 2) = z; NEXT(4); }
    case CDL_OP_LEN3: F(ip[1]) = sqrtf(dot3(R, ip[2], ip[2])); NEXT(3);
    case CDL_OP_NORM3: { const unsigned a = ip[2]; const float l = sqrtf(dot3(R, a, a)); const float x = F(a) / l, y = F(a + 1) / l, z = F(a + 2) / l;
      F(ip[1]) = x; F(ip[1] + 1) = y; F(ip[1] + 2) = z; NEXT(3); }
    case CDL_OP_SAFENORM3: { const unsigned a = ip[2]; const float l = sqrtf(dot3(R, a, a)); float x = 0.0f, y = 1.0f, z = 0.0f;
      if (l > 1e-20f) { const float m = fmaxf(l, 1e-20f); x = F(a) / m; y = F(a + 1) / m; z = F(a + 2) / m; }
      F(ip[1]) = x; F(ip[1] + 1) = y; F(ip[1] + 2) = z; NEXT(3); }
    case CDL_OP_SEL3: { const unsigned s = R[ip[2]].i ? ip[3] : ip[4]; cdl_vm_word a = R[s], b = R[s + 1], d = R[s + 2]; R[ip[1]] = a; R[ip[1] + 1] = b; R[ip[1] + 2] = d; NEXT(5); }
    ALL2(G2) ALL1(G1) ALL3(G3)
    case CDL_OP_VSEL: { const unsigned w = H & 7, s = R[ip[2]].i ? ip[3] : ip[4]; cdl_vm_word o[4];
      for (unsigned q = 0; q < w; q++) o[q] = R[s + q];
      for (unsigned q = 0; q < w; q++) R[ip[1] + q] = o[q];
      NEXT(5); }
    case CDL_OP_VDOT: { const unsigned w = H & 7, a = ip[2], b = ip[3]; float s = F(a) * F(b); for (unsigned q = 1; q < w; q++) s = s + F(a + q) * F(b + q); F(ip[1]) = s; NEXT(4); }
    case CDL_OP_VLEN: { const unsigned w = H & 7, a = ip[2]; float s = F(a) * F(a); for (unsigned q = 1; q < w; q++) s = s + F(a + q) * F(a + q); F(ip[1]) = sqrtf(s); NEXT(3); }
    case CDL_OP_VNORM: case CDL_OP_VSAFENORM: {
      const unsigned w = H & 7, a = ip[2]; float s = F(a) * F(a), o[4];
      for (unsigned q = 1; q < w; q++) s = s + F(a + q) * F(a + q);
      const float l = sqrtf(s);
      if ((ip[0] & 255) == CDL_OP_VNORM) for (unsigned q = 0; q < w; q++) o[q] = F(a + q) / l;
      else if (l > 1e-20f) { const float m = fmaxf(l, 1e-20f); for (unsigned q = 0; q < w; q++) o[q] = F(a + q) / m; }
      else for (unsigned q = 0; q < w; q++) o[q] = (w == 2 ? q == 0 : w == 3 ? q == 1 : q == 3) ? 1.0f : 0.0f;
      for (unsigned q = 0; q < w; q++) F(ip[1] + q) = o[q];
      NEXT(3);
    }
    case CDL_OP_IADD: R[ip[1]].u = R[ip[2]].u + R[ip[3]].u; NEXT(4);
    case CDL_OP_ISUB: R[ip[1]].u = R[ip[2]].u - R[ip[3]].u; NEXT(4);
    case CDL_OP_IMUL: R[ip[1]].u = R[ip[2]].u * R[ip[3]].u; NEXT(4);
    case CDL_OP_IOR: R[ip[1]].u = R[ip[2]].u | R[ip[3]].u; NEXT(4);
    case CDL_OP_IAND: R[ip[1]].u = R[ip[2]].u & R[ip[3]].u; NEXT(4);
    case CDL_OP_IXOR: R[ip[1]].u = R[ip[2]].u ^ R[ip[3]].u; NEXT(4);
    case CDL_OP_IEQ: R[ip[1]].i = R[ip[2]].i == R[ip[3]].i; NEXT(4);
    case CDL_OP_INE: R[ip[1]].i = R[ip[2]].i != R[ip[3]].i; NEXT(4);
    case CDL_OP_ILT: R[ip[1]].i = R[ip[2]].i < R[ip[3]].i; NEXT(4);
    case CDL_OP_ILE: R[ip[1]].i = R[ip[2]].i <= R[ip[3]].i; NEXT(4);
    case CDL_OP_IGT: R[ip[1]].i = R[ip[2]].i > R[ip[3]].i; NEXT(4);
    case CDL_OP_IGE: R[ip[1]].i = R[ip[2]].i >= R[ip[3]].i; NEXT(4);
    case CDL_OP_AND: R[ip[1]].i = R[ip[2]].i && R[ip[3]].i; NEXT(4);
    case CDL_OP_OR: R[ip[1]].i = R[ip[2]].i || R[ip[3]].i; NEXT(4);
    case CDL_OP_NOT: R[ip[1]].i = !R[ip[2]].i; NEXT(3);
    case CDL_OP_INEG: R[ip[1]].u = 0u - R[ip[2]].u; NEXT(3);
    case CDL_OP_ITOF: F(ip[1]) = (float)R[ip[2]].i; NEXT(3);
    case CDL_OP_FTOI: R[ip[1]].i = ftoi(F(ip[2])); NEXT(3);
    case CDL_OP_CALL: {
      switch (H) {
        case CDL_K_fresnelDielectric: F(ip[1]) = k->fresnelDielectric(F(ip[2]), F(ip[3])); NEXT(4);
        case CDL_K_noise3: F(ip[1]) = k->noise3(&F(ip[2])); NEXT(3);
        case CDL_K_fbm3: F(ip[1]) = k->fbm3(&F(ip[2]), ip[5], F(ip[3]), F(ip[4]), ip[6]); NEXT(7);
        case CDL_K_voronoi3: { float o[4]; k->voronoi3(&F(ip[2]), o); memcpy(&R[ip[1]], o, 16); NEXT(3); }
        case CDL_K_tangentWorld: { float o[3]; k->tangentWorld(HITP(ip[2]), &F(ip[3]), F(ip[4]), &F(ip[5]), o); memcpy(&R[ip[1]], o, 12); NEXT(6); }
        case CDL_K_sellmeier: F(ip[1]) = k->sellmeier(F(ip[2]), &F(ip[3]), &F(ip[4])); NEXT(5);
        case CDL_K_traceScene: { cdl_hit o; k->traceScene(&F(ip[2]), &F(ip[3]), F(ip[4]), &o); memcpy(&R[ip[1]], &o, sizeof o); NEXT(5); }
        case CDL_K_occluded: R[ip[1]].i = k->occluded(&F(ip[2]), &F(ip[3]), F(ip[4])) != 0; NEXT(5);
        case CDL_K_hitAlbedo: { float o[3]; k->hitAlbedo(HITP(ip[2]), &F(ip[3]), o); memcpy(&R[ip[1]], o, 12); NEXT(4); }
        case CDL_K_hitEmission: { float o[3]; k->hitEmission(HITP(ip[2]), &F(ip[3]), o); memcpy(&R[ip[1]], o, 12); NEXT(4); }
        case CDL_K_hash13: F(ip[1]) = k->hash13(&F(ip[2])); NEXT(3);
        case CDL_K_voronoiVec3: { float o[3]; k->voronoiVec3(&F(ip[2]), o); memcpy(&R[ip[1]], o, 12); NEXT(3); }
        case CDL_K_envSun: { float o[3]; k->envSun(&F(ip[2]), o); memcpy(&R[ip[1]], o, 12); NEXT(3); }
        case CDL_K_rnd: F(ip[1]) = k->rnd(); NEXT(2);
        case CDL_K_rnd2: { float o[2]; k->rnd2(o); memcpy(&R[ip[1]], o, 8); NEXT(2); }
        case CDL_K_cosHemiN: { float o[3]; k->cosHemiN(&F(ip[2]), o); memcpy(&R[ip[1]], o, 12); NEXT(3); }
      }
      return;   /* unreachable for a verified program */
    }
    case CDL_OP_FRESDOT: { const float d = fminf(fmaxf(dot3(R, ip[2], ip[3]), 0.0f), 1.0f); F(ip[1]) = k->fresnelDielectric(d, F(ip[4])); NEXT(5); }
    case CDL_OP_STRIPES: { const float t = F(ip[2]) * F(ip[3]); F(ip[1]) = step_(F(ip[4]), fract_(t)); NEXT(5); }
    case CDL_OP_CHECKER: { const unsigned a = ip[2], b = ip[3];
      const float s = CDL_VM_FLOORF(F(a) * F(b)) + CDL_VM_FLOORF(F(a + 1) * F(b + 1)); F(ip[1]) = fmodp(s, 2.0f); NEXT(4); }
    case CDL_OP_MAD: F(ip[1]) = F(ip[2]) * F(ip[3]) + F(ip[4]); NEXT(5);
    case CDL_OP_MAD3S: { const unsigned a = ip[2], cc = ip[4]; const float s = F(ip[3]); float o[3];
      for (int q = 0; q < 3; q++) o[q] = F(a + q) * s + F(cc + q);
      F(ip[1]) = o[0]; F(ip[1] + 1) = o[1]; F(ip[1] + 2) = o[2];
      NEXT(5); }
  }
  /* unreachable for a verified program */
}

/* ------------------------------------------------------------ entry points ---- */
void cdl_vm_eval_material(cdl_vm_ctx *c, const cdl_hit *h, const float wo[3], float u, cdl_lobe *out) {
  const cdl_vm_entry_desc *e = &c->p->entry[CDL_E_evalMaterial];
  cdl_vm_word *R = c->R;
  const cdl_hit *saved = c->hit;
  R[e->arg].f = wo[0]; R[e->arg + 1].f = wo[1]; R[e->arg + 2].f = wo[2]; R[e->arg + 3].f = u;
  c->hit = h;
  run(c, e->pc);
  c->hit = saved;
  memcpy(out, &R[e->ret], sizeof *out);
}
float cdl_vm_sd_user(cdl_vm_ctx *c, int k, const float p[3]) {
  const cdl_vm_entry_desc *e = &c->p->entry[CDL_E_sdUser];
  cdl_vm_word *R = c->R;
  R[e->arg].i = k; R[e->arg + 1].f = p[0]; R[e->arg + 2].f = p[1]; R[e->arg + 3].f = p[2];
  run(c, e->pc);
  return R[e->ret].f;
}
float cdl_vm_height_at(cdl_vm_ctx *c, int k, const float xz[2]) {
  const cdl_vm_entry_desc *e = &c->p->entry[CDL_E_heightAt];
  cdl_vm_word *R = c->R;
  R[e->arg].i = k; R[e->arg + 1].f = xz[0]; R[e->arg + 2].f = xz[1];
  run(c, e->pc);
  return R[e->ret].f;
}
float cdl_vm_density_of(cdl_vm_ctx *c, int m, const float P[3]) {
  const cdl_vm_entry_desc *e = &c->p->entry[CDL_E_densityOf];
  cdl_vm_word *R = c->R;
  R[e->arg].i = m; R[e->arg + 1].f = P[0]; R[e->arg + 2].f = P[1]; R[e->arg + 3].f = P[2];
  run(c, e->pc);
  return R[e->ret].f;
}
void cdl_vm_custom_kernel(cdl_vm_ctx *c, const float ro[3], const float rd[3], float out[3]) {
  const cdl_vm_entry_desc *e = &c->p->entry[CDL_E_customKernel];
  cdl_vm_word *R = c->R;
  for (int q = 0; q < 3; q++) { R[e->arg + q].f = ro[q]; R[e->arg + 3 + q].f = rd[q]; }
  run(c, e->pc);
  memcpy(out, &R[e->ret], 12);
}
