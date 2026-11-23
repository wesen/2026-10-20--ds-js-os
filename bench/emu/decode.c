/* rv32emu: decoding the C extension (with RV32FC's c.flw, c.fsw, c.flwsp, c.fswsp). */
#include "machine.h"

/* ---- the C extension: each 16-bit instruction becomes the 32-bit one it stands for ---- */
static uint32_t bits(uint32_t v, int hi, int lo) { return (v >> lo) & ((1u << (hi - lo + 1)) - 1); }
static uint32_t enc_i(int32_t imm, uint32_t rs1, uint32_t f3, uint32_t rd, uint32_t op) { return ((uint32_t)imm & 0xfff) << 20 | rs1 << 15 | f3 << 12 | rd << 7 | op; }
static uint32_t enc_s(int32_t imm, uint32_t rs2, uint32_t rs1, uint32_t f3, uint32_t op)
{
	return bits((uint32_t)imm, 11, 5) << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | bits((uint32_t)imm, 4, 0) << 7 | op;
}
static uint32_t enc_b(int32_t imm, uint32_t rs2, uint32_t rs1, uint32_t f3)
{
	uint32_t m = (uint32_t)imm;
	return bits(m, 12, 12) << 31 | bits(m, 10, 5) << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | bits(m, 4, 1) << 8 | bits(m, 11, 11) << 7 | 0x63;
}
static uint32_t enc_j(int32_t imm, uint32_t rd)
{
	uint32_t m = (uint32_t)imm;
	return bits(m, 20, 20) << 31 | bits(m, 10, 1) << 21 | bits(m, 11, 11) << 20 | bits(m, 19, 12) << 12 | rd << 7 | 0x6f;
}
static uint32_t enc_r(uint32_t f7, uint32_t rs2, uint32_t rs1, uint32_t f3, uint32_t rd) { return f7 << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | rd << 7 | 0x33; }
static int32_t sxb(uint32_t v, int nbits) { return (int32_t)(v << (32 - nbits)) >> (32 - nbits); }
uint32_t expand_c(uint32_t c, uint32_t pc)
{
	uint32_t f3 = bits(c, 15, 13), rd = bits(c, 11, 7), rs2 = bits(c, 6, 2), rdp = bits(c, 4, 2) + 8, rs1p = bits(c, 9, 7) + 8;
	int32_t imm6 = sxb(bits(c, 12, 12) << 5 | bits(c, 6, 2), 6);
	switch (c & 3) {
	case 0:
		switch (f3) {
		case 0: {   /* c.addi4spn */
			uint32_t u = bits(c, 12, 11) << 4 | bits(c, 10, 7) << 6 | bits(c, 6, 6) << 2 | bits(c, 5, 5) << 3;
			if (!u) break;
			return enc_i((int32_t)u, 2, 0, rdp, 0x13);
		}
		case 2: case 3: return enc_i((int32_t)(bits(c, 12, 10) << 3 | bits(c, 6, 6) << 2 | bits(c, 5, 5) << 6), rs1p, 2, rdp, f3 == 2 ? 0x03 : 0x07);   /* c.lw, c.flw */
		case 6: case 7: return enc_s((int32_t)(bits(c, 12, 10) << 3 | bits(c, 6, 6) << 2 | bits(c, 5, 5) << 6), rdp, rs1p, 2, f3 == 6 ? 0x23 : 0x27);  /* c.sw, c.fsw */
		}
		break;
	case 1:
		switch (f3) {
		case 0: return enc_i(imm6, rd, 0, rd, 0x13);   /* c.addi, c.nop */
		case 1: case 5: {                              /* c.jal, c.j */
			int32_t off = sxb(bits(c, 12, 12) << 11 | bits(c, 11, 11) << 4 | bits(c, 10, 9) << 8 | bits(c, 8, 8) << 10 | bits(c, 7, 7) << 6
				| bits(c, 6, 6) << 7 | bits(c, 5, 3) << 1 | bits(c, 2, 2) << 5, 12);
			return enc_j(off, f3 == 1 ? 1 : 0);
		}
		case 2: return enc_i(imm6, 0, 0, rd, 0x13);    /* c.li */
		case 3:
			if (rd == 2) {                             /* c.addi16sp */
				int32_t m = sxb(bits(c, 12, 12) << 9 | bits(c, 6, 6) << 4 | bits(c, 5, 5) << 6 | bits(c, 4, 3) << 7 | bits(c, 2, 2) << 5, 10);
				if (!m) break;
				return enc_i(m, 2, 0, 2, 0x13);
			}
			if (!imm6) break;
			return ((uint32_t)imm6 << 12 & 0xfffff000u) | rd << 7 | 0x37;   /* c.lui */
		case 4: {
			uint32_t sh = bits(c, 6, 2) | bits(c, 12, 12) << 5;
			switch (bits(c, 11, 10)) {
			case 0: return enc_i((int32_t)sh, rs1p, 5, rs1p, 0x13);                 /* c.srli */
			case 1: return enc_i((int32_t)(sh | 0x400), rs1p, 5, rs1p, 0x13);       /* c.srai */
			case 2: return enc_i(imm6, rs1p, 7, rs1p, 0x13);                         /* c.andi */
			case 3:
				if (bits(c, 12, 12)) break;
				switch (bits(c, 6, 5)) {
				case 0: return enc_r(0x20, rdp, rs1p, 0, rs1p);   /* c.sub */
				case 1: return enc_r(0, rdp, rs1p, 4, rs1p);      /* c.xor */
				case 2: return enc_r(0, rdp, rs1p, 6, rs1p);      /* c.or */
				case 3: return enc_r(0, rdp, rs1p, 7, rs1p);      /* c.and */
				}
			}
			break;
		}
		case 6: case 7: {                              /* c.beqz, c.bnez */
			int32_t off = sxb(bits(c, 12, 12) << 8 | bits(c, 11, 10) << 3 | bits(c, 6, 5) << 6 | bits(c, 4, 3) << 1 | bits(c, 2, 2) << 5, 9);
			return enc_b(off, 0, rs1p, f3 == 6 ? 0 : 1);
		}
		}
		break;
	case 2:
		switch (f3) {
		case 0: return enc_i((int32_t)(bits(c, 6, 2) | bits(c, 12, 12) << 5), rd, 1, rd, 0x13);   /* c.slli */
		case 2: if (!rd) break;                                                                 /* c.lwsp */
			return enc_i((int32_t)(bits(c, 12, 12) << 5 | bits(c, 6, 4) << 2 | bits(c, 3, 2) << 6), 2, 2, rd, 0x03);
		case 3: return enc_i((int32_t)(bits(c, 12, 12) << 5 | bits(c, 6, 4) << 2 | bits(c, 3, 2) << 6), 2, 2, rd, 0x07);   /* c.flwsp */
		case 4:
			if (!bits(c, 12, 12)) {
				if (!rs2) { if (!rd) break; return enc_i(0, rd, 0, 0, 0x67); }   /* c.jr */
				return enc_r(0, rs2, 0, 0, rd);                                      /* c.mv */
			}
			if (!rs2) { if (!rd) break; return enc_i(0, rd, 0, 1, 0x67); }       /* c.jalr (c.ebreak: rd 0) */
			return enc_r(0, rs2, rd, 0, rd);                                         /* c.add */
		case 6: case 7: return enc_s((int32_t)(bits(c, 12, 9) << 2 | bits(c, 8, 7) << 6), rs2, 2, 2, f3 == 6 ? 0x23 : 0x27);   /* c.swsp, c.fswsp */
		}
		break;
	}
	die("compressed instruction %#x at pc %#x", c, pc);
	return 0;
}
