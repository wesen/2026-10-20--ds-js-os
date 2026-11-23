/* rv32emu: the processor, RV32IMFC with the CSR instructions on fflags, frm and fcsr (fpu.c holds RV32F). */
#include "machine.h"

/* ---- the processor: RV32IMFC ---- */
static inline int32_t sx(uint32_t v, int bits) { return (int32_t)(v << (32 - bits)) >> (32 - bits); }
static inline __attribute__((always_inline)) void execute(void)
{
	{
		uint32_t i = ld16(pc), len = 2;
		if ((i & 3) != 3) i = expand_c(i, pc);   /* the C extension: 16 bits */
		else i = ld32(pc), len = 4;
		uint32_t op = i & 0x7f, rd = (i >> 7) & 31, f3 = (i >> 12) & 7, rs1 = (i >> 15) & 31, rs2 = (i >> 20) & 31, f7 = i >> 25;
		uint32_t a = x[rs1], b = x[rs2], next = pc + len, v = 0;
		int wr = 1;
		steps++;
		if (prof) prof[pc >> 1]++;
		switch (op) {
		case 0x37: v = i & 0xfffff000; break;                          /* lui */
		case 0x17: v = pc + (i & 0xfffff000); break;                   /* auipc */
		case 0x6f: v = next; next = pc + (uint32_t)(sx(((i >> 31) << 20) | (((i >> 12) & 0xff) << 12) | (((i >> 20) & 1) << 11) | (((i >> 21) & 0x3ff) << 1), 21)); break;   /* jal */
		case 0x67: v = next; next = (a + (uint32_t)sx(i >> 20, 12)) & ~1u; break;   /* jalr */
		}
		if (tracing && (op == 0x6f || op == 0x67) && (rd == 1 || (rd == 0 && rs1 != 1 && op == 0x67)))
			fprintf(stderr, "%s %s(%#x %#x %#x %#x %#x %#x) sp=%#x s1=%#x from %#x\n", rd ? "call" : "tail", func_at(next),
				x[10], x[11], x[12], x[13], x[14], x[15], x[2], x[9], pc);
		switch (op) {
		case 0x37: case 0x17: case 0x6f: case 0x67: break;
		case 0x63: {                                                   /* branches */
			int t;
			wr = 0;
			switch (f3) {
			case 0: t = a == b; break;
			case 1: t = a != b; break;
			case 4: t = (int32_t)a < (int32_t)b; break;
			case 5: t = (int32_t)a >= (int32_t)b; break;
			case 6: t = a < b; break;
			case 7: t = a >= b; break;
			default: die("branch %#x at %#x", i, pc);
			}
			if (t) next = pc + (uint32_t)sx(((i >> 31) << 12) | (((i >> 7) & 1) << 11) | (((i >> 25) & 0x3f) << 5) | (((i >> 8) & 0xf) << 1), 13);
			break;
		}
		case 0x03: {                                                   /* loads */
			uint32_t ad = a + (uint32_t)sx(i >> 20, 12);
			switch (f3) {
			case 0: v = (uint32_t)(int8_t)ld8(ad); break;
			case 1: v = (uint32_t)(int16_t)ld16(ad); break;
			case 2: v = ld32(ad); break;
			case 4: v = ld8(ad); break;
			case 5: v = ld16(ad); break;
			default: die("load %#x at %#x", i, pc);
			}
			break;
		}
		case 0x23: {                                                   /* stores */
			uint32_t ad = a + (uint32_t)sx(((i >> 25) << 5) | ((i >> 7) & 31), 12);
			wr = 0;
			switch (f3) {
			case 0: st8(ad, (uint8_t)b); break;
			case 1: st16(ad, (uint16_t)b); break;
			case 2: st32(ad, b); break;
			default: die("store %#x at %#x", i, pc);
			}
			break;
		}
		case 0x13: {                                                   /* immediates */
			uint32_t imm = (uint32_t)sx(i >> 20, 12), sh = (i >> 20) & 31;
			switch (f3) {
			case 0: v = a + imm; break;
			case 2: v = (int32_t)a < (int32_t)imm; break;
			case 3: v = a < imm; break;
			case 4: v = a ^ imm; break;
			case 6: v = a | imm; break;
			case 7: v = a & imm; break;
			case 1: v = a << sh; break;
			case 5: v = (i >> 30) & 1 ? (uint32_t)((int32_t)a >> sh) : a >> sh; break;
			}
			break;
		}
		case 0x33:                                                     /* registers */
			if (f7 == 1) {
				switch (f3) {
				case 0: v = a * b; break;
				case 1: v = (uint32_t)(((int64_t)(int32_t)a * (int64_t)(int32_t)b) >> 32); break;
				case 2: v = (uint32_t)(((int64_t)(int32_t)a * (int64_t)(uint64_t)b) >> 32); break;
				case 3: v = (uint32_t)(((uint64_t)a * (uint64_t)b) >> 32); break;
				case 4: v = b == 0 ? 0xffffffffu : ((int32_t)a == INT32_MIN && (int32_t)b == -1) ? a : (uint32_t)((int32_t)a / (int32_t)b); break;
				case 5: v = b == 0 ? 0xffffffffu : a / b; break;
				case 6: v = b == 0 ? a : ((int32_t)a == INT32_MIN && (int32_t)b == -1) ? 0 : (uint32_t)((int32_t)a % (int32_t)b); break;
				case 7: v = b == 0 ? a : a % b; break;
				}
			} else {
				switch (f3) {
				case 0: v = f7 == 0x20 ? a - b : a + b; break;
				case 1: v = a << (b & 31); break;
				case 2: v = (int32_t)a < (int32_t)b; break;
				case 3: v = a < b; break;
				case 4: v = a ^ b; break;
				case 5: v = f7 == 0x20 ? (uint32_t)((int32_t)a >> (b & 31)) : a >> (b & 31); break;
				case 6: v = a | b; break;
				case 7: v = a & b; break;
				}
			}
			break;
		case 0x0f: wr = 0; break;                                     /* fence */
		case 0x73:                                                     /* ecall: a host call, its number in a7 */
			if (f3 && (f3 & 3) && (i >> 20) >= 1 && (i >> 20) <= 3) { v = fp_csr(i, a); break; }   /* fflags, frm, fcsr */
			wr = 0;
			if (i == 0x00000073) hostcall(x[17]);
			else if (i == 0x00100073) die("ebreak at %#x", pc);
			else die("system instruction %#x at %#x", i, pc);
			break;
		case 0x07:                                                     /* flw */
			if (f3 != 2) die("load %#x at %#x", i, pc);
			f[rd] = ld32(a + (uint32_t)sx(i >> 20, 12));
			wr = 0;
			break;
		case 0x27:                                                     /* fsw */
			if (f3 != 2) die("store %#x at %#x", i, pc);
			st32(a + (uint32_t)sx(((i >> 25) << 5) | ((i >> 7) & 31), 12), f[rs2]);
			wr = 0;
			break;
		case 0x43: case 0x47: case 0x4b: case 0x4f:                    /* fmadd, fmsub, fnmsub, fnmadd */
			fp_fused(i);
			wr = 0;
			break;
		case 0x53:                                                     /* OP-FP */
			wr = fp_op(i, a, &v);
			break;
		default:
			die("instruction %#x at pc %#x", i, pc);
		}
		if (wr && rd) x[rd] = v;
		pc = next;
	}
}

void step(void) { execute(); }
void run(void) { for (;;) execute(); }
