/* rv32imfc-count.c (PICOCALC-CANDELA-SECTIONS): copied unchanged from PICOCALC-CANDELA-CPU-KERNEL scripts/05-rv32imfc-count.c
 * at commit 63e6997, which is PICOCALC-CANDELA-P4 06-rv32imfc-count.c plus counted regions (a7 = 500).
 * Copied so that this ticket does not depend on an unmerged branch. */
/* 05-rv32imfc-count.c (PICOCALC-CANDELA-CPU-KERNEL): PICOCALC-CANDELA-P4's 06-rv32imfc-count.c plus counted
 * regions. A third system call, a7 = 500, controls them: a0 = 1 begins a region, a0 = 0 ends it and adds
 * the instructions retired since the begin (by class) to an accumulator, a0 = 2 prints the accumulator as
 * one JSON line {"mark": a1, "instructions": ..., classes...} on stderr and clears it. The per-function
 * profile counts only inside regions once the program has used a region. The original header follows.
 *
 * 06-rv32imfc-count.c: a counting RV32IMFC interpreter for bare-metal ELF executables.
 *
 *   cc -O2 -o rv32imfc-count 05-rv32imfc-count.c -lm
 *   rv32imfc-count PROGRAM.elf [OUT.bin] [PROFILE.tsv]
 *
 * The repository's rv32emu (cji/tools/rv32/emu.c) executes RV32IM only; GCC's code for the ESP32-P4's
 * single-precision FPU and newlib's rv32imafc libm also use the F and C extensions. This interpreter
 * executes RV32I, M, F (single precision), C (including C.FLW/C.FSW and their SP forms) and the CSRs
 * fflags/frm/fcsr, and counts retired instructions by class. It is a counter, not a timing model:
 * every instruction counts once, whatever its latency on the P4.
 *
 * The guest runs from address 0x10000 upwards (as linked by the experiment's build script) with a
 * 16 MB memory and sp at the top. Two system calls: a7 = 64 write(fd, buf, len) (fd 1 goes to OUT.bin
 * when given, else stdout) and a7 = 93 exit(code). PROFILE.tsv receives instructions per function
 * (exclusive, by the ELF symbol table), so the cost of a sample can be split between traversal,
 * shading, light sampling and the sky. */
#include <elf.h>
#include <fenv.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* PICOCALC-CANDELA-SECTIONS: -DCOUNT_MEM_MB=64 for scenes whose packed buffers exceed 16 MB (the T3 mesh presets) */
#ifndef COUNT_MEM_MB
#define COUNT_MEM_MB 16
#endif
#define MEM ((uint32_t)COUNT_MEM_MB << 20)
static uint8_t *mem;
static uint32_t x[32], pc;
static float f[32];
static uint32_t fflags, frm;
static uint64_t steps;
enum { ALU, MUL, DIV, LOAD, STORE, BRANCH, JUMP, FLOAD, FSTORE, FADD, FMUL, FMA, FDIV, FSQRT, FMISC, FCVT, FCMP, SYS, NCLASS };
static const char *CLASS[] = {"alu", "mul", "div", "load", "store", "branch", "jump", "fload", "fstore", "fadd", "fmul", "fma", "fdiv", "fsqrt", "fminmax_sgnj", "fcvt_fmv", "fcmp_class", "sys"};
static uint64_t cls[NCLASS];
static uint64_t mark_steps, mark_cls[NCLASS], acc_steps, acc_cls[NCLASS];
static int regions_used, in_region;
static FILE *out;

static void die(const char *m, uint32_t a) { fprintf(stderr, "rv32imfc-count: %s %#x at pc %#x after %llu\n", m, a, pc, (unsigned long long)steps); exit(70); }
static void chk(uint32_t a, uint32_t n) { if (a < 0x1000 || (uint64_t)a + n > MEM) die("bad access", a); }
static uint32_t ld32(uint32_t a) { uint32_t v; chk(a, 4); memcpy(&v, mem + a, 4); return v; }
static uint32_t ld16(uint32_t a) { uint16_t v; chk(a, 2); memcpy(&v, mem + a, 2); return v; }
static uint32_t ld8(uint32_t a) { chk(a, 1); return mem[a]; }
static void st32(uint32_t a, uint32_t v) { chk(a, 4); memcpy(mem + a, &v, 4); }
static void st16(uint32_t a, uint32_t v) { uint16_t h = v; chk(a, 2); memcpy(mem + a, &h, 2); }
static void st8(uint32_t a, uint32_t v) { chk(a, 1); mem[a] = v; }
static int32_t sx(uint32_t v, int bits) { return (int32_t)(v << (32 - bits)) >> (32 - bits); }
static uint32_t fb(float v) { uint32_t u; memcpy(&u, &v, 4); return u; }
static float bf(uint32_t u) { float v; memcpy(&v, &u, 4); return v; }

/* ---- per-function profile from the symbol table ---- */
typedef struct { uint32_t lo, hi; const char *name; uint64_t n; } fn_t;
static fn_t *fns; static int nfns, lastfn = -1;
static int fncmp(const void *a, const void *b) { const fn_t *p = a, *q = b; return p->lo < q->lo ? -1 : p->lo > q->lo; }
static void account(uint32_t a) {
	if (!nfns) return;
	if (lastfn >= 0 && a >= fns[lastfn].lo && a < fns[lastfn].hi) { fns[lastfn].n++; return; }
	int lo = 0, hi = nfns - 1, k = -1;
	while (lo <= hi) { int m = (lo + hi) / 2; if (fns[m].lo <= a) { k = m; lo = m + 1; } else hi = m - 1; }
	if (k >= 0 && a < fns[k].hi) { lastfn = k; fns[k].n++; }
}

/* ---- float helpers: RISC-V semantics on the host's IEEE single precision ---- */
static uint32_t canon(float v) { return isnan(v) ? 0x7fc00000u : fb(v); }
static float fmin_rv(float a, float b) { if (isnan(a) && isnan(b)) return bf(0x7fc00000u); if (isnan(a)) return b; if (isnan(b)) return a; if (a == 0 && b == 0) return signbit(a) ? a : b; return a < b ? a : b; }
static float fmax_rv(float a, float b) { if (isnan(a) && isnan(b)) return bf(0x7fc00000u); if (isnan(a)) return b; if (isnan(b)) return a; if (a == 0 && b == 0) return signbit(a) ? b : a; return a > b ? a : b; }
static double rnd(double v, uint32_t rm) {
	if (rm == 7) rm = frm;
	switch (rm) { case 1: return trunc(v); case 2: return floor(v); case 3: return ceil(v); case 4: return round(v); default: return nearbyint(v); }
}
static uint32_t cvt_w(float v, uint32_t rm, int uns) {
	if (isnan(v)) return uns ? 0xffffffffu : 0x7fffffffu;
	double r = rnd(v, rm);
	if (uns) { if (r < 0) return 0; if (r > 4294967295.0) return 0xffffffffu; return (uint32_t)r; }
	if (r < -2147483648.0) return 0x80000000u; if (r > 2147483647.0) return 0x7fffffffu; return (uint32_t)(int32_t)r;
}
static uint32_t fclass(float v) {
	uint32_t u = fb(v); int s = u >> 31; uint32_t e = (u >> 23) & 0xff, m = u & 0x7fffff;
	if (e == 0xff) return m ? ((m & 0x400000) ? 1u << 9 : 1u << 8) : (s ? 1u : 1u << 7);
	if (e == 0) return m ? (s ? 1u << 2 : 1u << 5) : (s ? 1u << 3 : 1u << 4);
	return s ? 1u << 1 : 1u << 6;
}

static uint32_t csr_rw(uint32_t csr, uint32_t v, int op /*0 read, 1 write, 2 set, 3 clear*/) {
	uint32_t old;
	switch (csr) {
	case 1: old = fflags; break; case 2: old = frm; break; case 3: old = (frm << 5) | fflags; break;
	case 0xc00: case 0xc02: case 0xb00: case 0xb02: return (uint32_t)steps;
	case 0xc80: case 0xc82: case 0xb80: case 0xb82: return (uint32_t)(steps >> 32);
	default: return 0;
	}
	uint32_t n = op == 1 ? v : op == 2 ? (old | v) : op == 3 ? (old & ~v) : old;
	if (op) { if (csr == 1) fflags = n & 31; else if (csr == 2) frm = n & 7; else { fflags = n & 31; frm = (n >> 5) & 7; } }
	return old;
}

/* expand a 16-bit instruction to its 32-bit equivalent fields and execute it through the same path */
static uint32_t expand(uint32_t c) {
	uint32_t op = c & 3, f3 = c >> 13, rdp = ((c >> 2) & 7) + 8, rs1p = ((c >> 7) & 7) + 8, rd = (c >> 7) & 31, rs2 = (c >> 2) & 31;
	int32_t imm;
#define I_(imm, rs1, f3, rd, opc) ((((uint32_t)(imm) & 0xfff) << 20) | ((rs1) << 15) | ((f3) << 12) | ((rd) << 7) | (opc))
#define S_(imm, rs2, rs1, f3, opc) (((((uint32_t)(imm) >> 5) & 0x7f) << 25) | ((rs2) << 20) | ((rs1) << 15) | ((f3) << 12) | (((uint32_t)(imm) & 31) << 7) | (opc))
#define R_(f7, rs2, rs1, f3, rd, opc) (((f7) << 25) | ((rs2) << 20) | ((rs1) << 15) | ((f3) << 12) | ((rd) << 7) | (opc))
#define J_(off, rd) ((((uint32_t)(off) >> 20 & 1) << 31) | ((((uint32_t)(off) >> 1) & 0x3ff) << 21) | ((((uint32_t)(off) >> 11) & 1) << 20) | ((((uint32_t)(off) >> 12) & 0xff) << 12) | ((rd) << 7) | 0x6f)
#define B_(off, rs2, rs1, f3) ((((uint32_t)(off) >> 12 & 1) << 31) | ((((uint32_t)(off) >> 5) & 0x3f) << 25) | ((rs2) << 20) | ((rs1) << 15) | ((f3) << 12) | ((((uint32_t)(off) >> 1) & 0xf) << 8) | ((((uint32_t)(off) >> 11) & 1) << 7) | 0x63)
	if (op == 0) {
		uint32_t lw = ((c >> 7) & 0x38) | ((c >> 4) & 4) | ((c << 1) & 0x40);
		switch (f3) {
		case 0: imm = ((c >> 7) & 0x30) | ((c >> 1) & 0x3c0) | ((c >> 4) & 4) | ((c >> 2) & 8); if (!imm) die("illegal c.addi4spn", c); return I_(imm, 2, 0, rdp, 0x13);
		case 2: return I_(lw, rs1p, 2, rdp, 0x03);
		case 3: return I_(lw, rs1p, 2, rdp, 0x07);
		case 6: return S_(lw, rdp, rs1p, 2, 0x23);
		case 7: return S_(lw, rdp, rs1p, 2, 0x27);
		}
	} else if (op == 1) {
		int32_t i6 = sx(((c >> 7) & 0x20) | ((c >> 2) & 31), 6);
		switch (f3) {
		case 0: return I_(i6, rd, 0, rd, 0x13);
		case 1: case 5: imm = sx(((c >> 1) & 0x800) | ((c >> 7) & 0x10) | ((c >> 1) & 0x300) | ((c << 2) & 0x400) | ((c >> 1) & 0x40) | ((c << 1) & 0x80) | ((c >> 2) & 0xe) | ((c << 3) & 0x20), 12); return J_(imm, f3 == 1 ? 1 : 0);
		case 2: return I_(i6, 0, 0, rd, 0x13);
		case 3:
			if (rd == 2) { imm = sx(((c >> 3) & 0x200) | ((c >> 2) & 0x10) | ((c << 1) & 0x40) | ((c << 4) & 0x180) | ((c << 3) & 0x20), 10); return I_(imm, 2, 0, 2, 0x13); }
			return (((uint32_t)i6 << 12) & 0xfffff000u) | (rd << 7) | 0x37;
		case 4: {
			uint32_t sh = ((c >> 7) & 0x20) | ((c >> 2) & 31);
			switch ((c >> 10) & 3) {
			case 0: return R_(0, sh, rs1p, 5, rs1p, 0x13);
			case 1: return R_(0x20, sh, rs1p, 5, rs1p, 0x13);
			case 2: return I_(i6, rs1p, 7, rs1p, 0x13);
			default: { static const uint32_t f3s[4] = {0, 4, 6, 7}; uint32_t k = (c >> 5) & 3; return R_(k == 0 ? 0x20 : 0, rdp, rs1p, f3s[k], rs1p, 0x33); }
			}
		}
		case 6: case 7: imm = sx(((c >> 4) & 0x100) | ((c >> 7) & 0x18) | ((c << 1) & 0xc0) | ((c >> 2) & 6) | ((c << 3) & 0x20), 9); return B_(imm, 0, rs1p, f3 == 6 ? 0 : 1);
		}
	} else if (op == 2) {
		uint32_t lsp = ((c >> 7) & 0x20) | ((c >> 2) & 0x1c) | ((c << 4) & 0xc0), ssp = ((c >> 7) & 0x3c) | ((c >> 1) & 0xc0);
		switch (f3) {
		case 0: return R_(0, ((c >> 7) & 0x20) | rs2, rd, 1, rd, 0x13);
		case 2: return I_(lsp, 2, 2, rd, 0x03);
		case 3: return I_(lsp, 2, 2, rd, 0x07);
		case 4:
			if (!((c >> 12) & 1)) return rs2 ? R_(0, rs2, 0, 0, rd, 0x33) : I_(0, rd, 0, 0, 0x67);
			if (!rs2 && !rd) return 0x00100073;
			return rs2 ? R_(0, rs2, rd, 0, rd, 0x33) : I_(0, rd, 0, 1, 0x67);
		case 6: return S_(ssp, rs2, 2, 2, 0x23);
		case 7: return S_(ssp, rs2, 2, 2, 0x27);
		}
	}
	die("unsupported compressed instruction", c);
	return 0;
}

static int step1(void) {
	uint32_t i = ld16(pc), len = 4;
	if ((i & 3) != 3) { i = expand(i); len = 2; } else i = ld32(pc);
	if (!regions_used || in_region) account(pc);
	steps++;
	uint32_t opc = i & 0x7f, rd = (i >> 7) & 31, f3 = (i >> 12) & 7, rs1 = (i >> 15) & 31, rs2 = (i >> 20) & 31, f7 = i >> 25;
	int32_t immI = (int32_t)i >> 20, immS = ((int32_t)i >> 25 << 5) | rd;
	int32_t immB = sx(((i >> 31) << 12) | (((i >> 7) & 1) << 11) | (((i >> 25) & 0x3f) << 5) | (((i >> 8) & 0xf) << 1), 13);
	int32_t immJ = sx(((i >> 31) << 20) | (((i >> 12) & 0xff) << 12) | (((i >> 20) & 1) << 11) | (((i >> 21) & 0x3ff) << 1), 21);
	uint32_t a = x[rs1], b = x[rs2], npc = pc + len, v = 0; int wr = 1;
	switch (opc) {
	case 0x37: v = i & 0xfffff000u; cls[ALU]++; break;
	case 0x17: v = pc + (i & 0xfffff000u); cls[ALU]++; break;
	case 0x6f: v = pc + len; npc = pc + immJ; cls[JUMP]++; break;
	case 0x67: v = pc + len; npc = (a + immI) & ~1u; cls[JUMP]++; break;
	case 0x63: { int t; switch (f3) { case 0: t = a == b; break; case 1: t = a != b; break; case 4: t = (int32_t)a < (int32_t)b; break; case 5: t = (int32_t)a >= (int32_t)b; break; case 6: t = a < b; break; case 7: t = a >= b; break; default: die("bad branch", i); t = 0; } if (t) npc = pc + immB; wr = 0; cls[BRANCH]++; break; }
	case 0x03: { uint32_t ad = a + immI; switch (f3) { case 0: v = sx(ld8(ad), 8); break; case 1: v = sx(ld16(ad), 16); break; case 2: v = ld32(ad); break; case 4: v = ld8(ad); break; case 5: v = ld16(ad); break; default: die("bad load", i); } cls[LOAD]++; break; }
	case 0x23: { uint32_t ad = a + immS; switch (f3) { case 0: st8(ad, b); break; case 1: st16(ad, b); break; case 2: st32(ad, b); break; default: die("bad store", i); } wr = 0; cls[STORE]++; break; }
	case 0x13: { uint32_t sh = immI & 31; switch (f3) { case 0: v = a + immI; break; case 2: v = (int32_t)a < immI; break; case 3: v = a < (uint32_t)immI; break; case 4: v = a ^ immI; break; case 6: v = a | immI; break; case 7: v = a & immI; break; case 1: v = a << sh; break; case 5: v = (i >> 30) & 1 ? (uint32_t)((int32_t)a >> sh) : a >> sh; break; } cls[ALU]++; break; }
	case 0x33:
		if (f7 == 1) {
			int64_t sa = (int32_t)a, sb = (int32_t)b; uint64_t ua = a, ub = b;
			switch (f3) {
			case 0: v = a * b; cls[MUL]++; break; case 1: v = (uint32_t)((sa * sb) >> 32); cls[MUL]++; break;
			case 2: v = (uint32_t)((sa * (int64_t)ub) >> 32); cls[MUL]++; break; case 3: v = (uint32_t)((ua * ub) >> 32); cls[MUL]++; break;
			case 4: v = b == 0 ? 0xffffffffu : ((int32_t)a == INT32_MIN && (int32_t)b == -1) ? a : (uint32_t)((int32_t)a / (int32_t)b); cls[DIV]++; break;
			case 5: v = b == 0 ? 0xffffffffu : a / b; cls[DIV]++; break;
			case 6: v = b == 0 ? a : ((int32_t)a == INT32_MIN && (int32_t)b == -1) ? 0 : (uint32_t)((int32_t)a % (int32_t)b); cls[DIV]++; break;
			case 7: v = b == 0 ? a : a % b; cls[DIV]++; break;
			}
		} else {
			switch (f3) {
			case 0: v = f7 == 0x20 ? a - b : a + b; break; case 1: v = a << (b & 31); break; case 2: v = (int32_t)a < (int32_t)b; break;
			case 3: v = a < b; break; case 4: v = a ^ b; break; case 5: v = f7 == 0x20 ? (uint32_t)((int32_t)a >> (b & 31)) : a >> (b & 31); break;
			case 6: v = a | b; break; case 7: v = a & b; break;
			}
			cls[ALU]++;
		}
		break;
	case 0x0f: wr = 0; cls[SYS]++; break;
	case 0x73:
		cls[SYS]++;
		if (f3 == 0) {
			wr = 0;
			if (i == 0x00000073) {
				if (x[17] == 93) return 0;
				if (x[17] == 500) {
					if (x[10] == 1) { regions_used = in_region = 1; mark_steps = steps; memcpy(mark_cls, cls, sizeof cls); }
					else if (x[10] == 0) { in_region = 0; acc_steps += steps - mark_steps; for (int k = 0; k < NCLASS; k++) acc_cls[k] += cls[k] - mark_cls[k]; }
					else if (x[10] == 2) { fprintf(stderr, "{\"mark\": %u, \"instructions\": %llu", x[11], (unsigned long long)acc_steps);
						for (int k = 0; k < NCLASS; k++) fprintf(stderr, ", \"%s\": %llu", CLASS[k], (unsigned long long)acc_cls[k]);
						fprintf(stderr, "}\n"); acc_steps = 0; memset(acc_cls, 0, sizeof acc_cls); }
					break;
				}
				if (x[17] == 64) { uint32_t p = x[11], n = x[12]; chk(p, n); fwrite(mem + p, 1, n, x[10] == 1 && out ? out : stderr); x[10] = n; break; }
				die("unknown ecall", x[17]);
			}
			die("ebreak or unsupported system instruction", i);
		} else {
			uint32_t csr = i >> 20, src = (f3 & 4) ? rs1 : a; int op = (f3 & 3) == 1 ? 1 : (f3 & 3) == 2 ? 2 : 3;
			if (op != 1 && src == 0) op = 0;
			v = csr_rw(csr, src, op);
		}
		break;
	case 0x07: if (f3 != 2) die("only flw", i); f[rd] = bf(ld32(a + immI)); wr = 0; cls[FLOAD]++; break;
	case 0x27: if (f3 != 2) die("only fsw", i); st32(a + immS, fb(f[rs2])); wr = 0; cls[FSTORE]++; break;
	case 0x43: case 0x47: case 0x4b: case 0x4f: {
		float r3 = f[i >> 27], p = f[rs1], q = f[rs2], r;
		if (((i >> 25) & 3) != 0) die("only single-precision fused ops", i);
		switch (opc) { case 0x43: r = fmaf(p, q, r3); break; case 0x47: r = fmaf(p, q, -r3); break; case 0x4b: r = fmaf(-p, q, r3); break; default: r = fmaf(-p, q, -r3); }
		f[rd] = r; wr = 0; cls[FMA]++; break;
	}
	case 0x53: {
		float p = f[rs1], q = f[rs2];
		wr = 0;
		switch (f7) {
		case 0x00: f[rd] = p + q; cls[FADD]++; break;
		case 0x04: f[rd] = p - q; cls[FADD]++; break;
		case 0x08: f[rd] = p * q; cls[FMUL]++; break;
		case 0x0c: f[rd] = p / q; cls[FDIV]++; break;
		case 0x2c: f[rd] = sqrtf(p); cls[FSQRT]++; break;
		case 0x10: { uint32_t s = f3 == 0 ? fb(q) : f3 == 1 ? ~fb(q) : fb(p) ^ fb(q); f[rd] = bf((fb(p) & 0x7fffffffu) | (s & 0x80000000u)); cls[FMISC]++; break; }
		case 0x14: f[rd] = f3 == 0 ? fmin_rv(p, q) : fmax_rv(p, q); cls[FMISC]++; break;
		case 0x60: x[rd] = cvt_w(p, f3, rs2 & 1); wr = 2; cls[FCVT]++; break;
		case 0x68: f[rd] = rs2 & 1 ? (float)(uint32_t)a : (float)(int32_t)a; cls[FCVT]++; break;
		case 0x70: x[rd] = f3 == 0 ? fb(p) : fclass(p); wr = 2; cls[f3 == 0 ? FCVT : FCMP]++; break;
		case 0x78: f[rd] = bf(a); cls[FCVT]++; break;
		case 0x50: x[rd] = f3 == 2 ? p == q : f3 == 1 ? p < q : p <= q; wr = 2; cls[FCMP]++; break;
		default: die("unsupported OP-FP", i);
		}
		if (wr == 2) wr = 0, x[0] = 0;
		(void)canon;
		break;
	}
	case 0x2f: { /* A: single hart, so a plain read-modify-write */
		uint32_t ad = a, old = ld32(ad), f5 = i >> 27, nv;
		switch (f5) { case 2: v = old; break; case 3: st32(ad, b); v = 0; cls[STORE]++; break; case 1: nv = b; goto amo; case 0: nv = old + b; goto amo; case 4: nv = old ^ b; goto amo; case 12: nv = old & b; goto amo; case 8: nv = old | b; goto amo;
		default: die("unsupported AMO", i); }
		cls[LOAD]++; break;
	amo: st32(ad, nv); v = old; cls[LOAD]++; break;
	}
	default: die("illegal instruction", i);
	}
	if (wr && rd) x[rd] = v;
	pc = npc;
	return 1;
}

int main(int argc, char **argv) {
	if (argc < 2) { fprintf(stderr, "usage: rv32imfc-count PROGRAM.elf [OUT.bin] [PROFILE.tsv]\n"); return 2; }
	FILE *e = fopen(argv[1], "rb"); if (!e) { perror(argv[1]); return 2; }
	fseek(e, 0, SEEK_END); long n = ftell(e); fseek(e, 0, SEEK_SET);
	uint8_t *img = malloc(n); if (fread(img, 1, n, e) != (size_t)n) return 2; fclose(e);
	Elf32_Ehdr *eh = (Elf32_Ehdr *)img;
	if (memcmp(eh->e_ident, ELFMAG, 4) || eh->e_machine != EM_RISCV) { fprintf(stderr, "not a RISC-V ELF\n"); return 2; }
	mem = calloc(1, MEM);
	for (int k = 0; k < eh->e_phnum; k++) {
		Elf32_Phdr *ph = (Elf32_Phdr *)(img + eh->e_phoff + k * eh->e_phentsize);
		if (ph->p_type != PT_LOAD) continue;
		if (ph->p_vaddr + ph->p_memsz > MEM) { fprintf(stderr, "segment outside memory\n"); return 2; }
		memcpy(mem + ph->p_vaddr, img + ph->p_offset, ph->p_filesz);
	}
	for (int k = 0; k < eh->e_shnum; k++) {
		Elf32_Shdr *sh = (Elf32_Shdr *)(img + eh->e_shoff + k * eh->e_shentsize);
		if (sh->sh_type != SHT_SYMTAB) continue;
		Elf32_Shdr *strs = (Elf32_Shdr *)(img + eh->e_shoff + sh->sh_link * eh->e_shentsize);
		int cnt = sh->sh_size / sizeof(Elf32_Sym); fns = calloc(cnt, sizeof(fn_t));
		for (int j = 0; j < cnt; j++) {
			Elf32_Sym *s = (Elf32_Sym *)(img + sh->sh_offset) + j;
			if (ELF32_ST_TYPE(s->st_info) != STT_FUNC || !s->st_size) continue;
			fns[nfns++] = (fn_t){s->st_value, s->st_value + s->st_size, (const char *)img + strs->sh_offset + s->st_name, 0};
		}
		qsort(fns, nfns, sizeof(fn_t), fncmp);
	}
	out = argc > 2 ? fopen(argv[2], "wb") : stdout;
	pc = eh->e_entry; x[2] = MEM - 16;
	while (step1()) {}
	uint64_t fp = 0; for (int k = FLOAD; k <= FCMP; k++) fp += cls[k];
	fprintf(stderr, "rv32imfc-count: exit %d after %llu instructions (%llu floating-point)\n", (int)x[10], (unsigned long long)steps, (unsigned long long)fp);
	printf("%s", "");
	fprintf(stderr, "{\"instructions\": %llu", (unsigned long long)steps);
	for (int k = 0; k < NCLASS; k++) fprintf(stderr, ", \"%s\": %llu", CLASS[k], (unsigned long long)cls[k]);
	fprintf(stderr, "}\n");
	if (argc > 3) { FILE *p = fopen(argv[3], "w"); for (int k = 0; k < nfns; k++) if (fns[k].n) fprintf(p, "%llu\t%s\n", (unsigned long long)fns[k].n, fns[k].name); fclose(p); }
	if (out && out != stdout) fclose(out);
	return (int)x[10];
}
