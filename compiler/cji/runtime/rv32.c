/* ---- Chapter 29: slas for rv32 ----------------------------------------------------------
 * Included by slas.c when it is built as slas-rv32 (-DCJI_RV32 -DSLJIT_CONFIG_RISCV_32): the host's
 * slas with SLJIT's 32-bit RISC-V backend, writing objects for the ESP32-P4 that no C compiler or
 * linker touches. The SLIR is the same as for x86-64: 64-bit words, the same registers, the same
 * instructions. What differs is below it.
 *
 * Words. A SLIR word is a pair of 32-bit words, low first, wherever it lives. Every SLIR register
 * has a home in the frame (8 bytes, before the function's own locals), so an instruction loads its
 * operands' pairs into scratch registers, works on them, and stores the result's pair. Addition and
 * subtraction carry from the low word to the high one; and, or, xor and constant shifts work on the
 * halves; multiplication, shifts by a register and every double operation are calls: rt_i64_*
 * (runtime.c) and the soft-float helpers the board's firmware already has (__adddf3 and the rest).
 *
 * Addresses. The code holds none. Everything outside it (a runtime function or global, a literal,
 * a static closure, a function whose address is taken) is a 32-bit word in a table that follows the
 * code in .text, and the code reaches the table relative to itself: each function starts with
 * auipc/addi into S0, patched once the code's size is known. So the code is position-independent,
 * and the object's relocations are all R_RISCV_32 on the table and on .data: what a module loader
 * (the board's elf_loader, bench/emu/emu.c) applies.
 *
 * The root stack. One SLIR register is not in the frame: s0, the root stack's pointer, which every
 * function finds where its caller left it (on x86-64 it is SLJIT's S0, a callee-saved register,
 * so it reaches a callee untouched and comes back restored). Here it is S1, for the same reason; it
 * is a C pointer, one word, and its high word reads as 0.
 *
 * Calls. Arguments are pairs in a0..a7 (R0..R7): up to four SLIR words, low word first, as the C
 * calling convention passes int64_t. A runtime function with a pointer parameter takes one register
 * for it (rt_collect's first). Results come back in a0 and a1. */

#ifndef CJI_BOARD
#include <sys/mman.h>
void *rv32_low_exec(unsigned long size)
{
	void *p = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_32BIT, -1, 0);
	return p == MAP_FAILED ? NULL : p;
}
#else   /* (CJI-4: slas on the board, in the firmware: every address is below 4 GB, and nothing runs there) */
void *rv32_low_exec(unsigned long size) { return malloc(size); }
#endif

enum { SYM_CODE = 16, SYM_EXT };   /* a function of this object, by address; a C symbol by its own name */
#define TB SLJIT_S0                /* the table's address, in every function */
#define RS SLJIT_S1                /* SLIR's s0, the root stack's pointer: a real register (below) */
#define NSCRATCH 9                 /* R0..R7: values and arguments; R8: a call's target */

typedef struct P { sljit_s32 arg; sljit_sw w; sljit_s32 arg2; sljit_sw w2; int narrow; } P;
static int addr_temps;             /* address registers used by the instruction being assembled (R4..R6) */

/* each function's auipc, to point at the table once its offset is known */
static struct { struct sljit_label *label; sljit_uw addr; } *tb_sites;
static int ntb_sites, tb_sites_cap;
static int rv32_main_fn;           /* main is not exported when there is a snapshot (later) */
#include "cji_elf.h"   /* (CJI_ELF_ROOTSTACK_SLACK) */
/* CJI-4: check every frame pushed onto the root stack against its end (CJI_RV32_ROOTCHECK=0: not, to measure) */
static int rootstack_check = 1;
static long rootstack_slack = CJI_ELF_ROOTSTACK_SLACK;   /* (--rootstack-slack: for code whose embedder keeps more) */
static int is_s0(const char *p) { p = skip((char *)p); return p[0] == 's' && p[1] == '0' && !isalnum((unsigned char)p[2]); }

/* The frame: the registers' homes first, then the function's own locals ([sp+k]). A RISC-V load
 * or store reaches 2 KB from sp in one instruction; the homes are used by every instruction, the
 * locals (spills, a call's extra arguments) far less, so the homes go where they are cheap. */
static int homes(void) { return 8 * (cur->scratches + cur->saveds); }
static int slot(char kind, int i) { return 8 * (kind == 'r' ? i : cur->scratches + i); }
static int table_entry(int kind, const char *text) { return aot_sym(kind, text); }
static void load_table(struct sljit_compiler *C, sljit_s32 reg, int k)
{
	sljit_emit_op1(C, SLJIT_MOV, reg, 0, SLJIT_MEM1(TB), 4 * (sljit_sw)k);
}
static sljit_s32 addr_temp(void)
{
	if (addr_temps == 3)
		die("an instruction with more than three memory operands");
	return SLJIT_R(4 + addr_temps++);
}

static P rv_operand(struct sljit_compiler *C, char *p)
{
	P o = { 0 };
	p = skip(p);
	if (*p == '#') {
		char *end;
		long long v = strtoll(p + 1, &end, 10);
		if (end == p + 1)
			die("bad immediate '%s'", p);
		o.arg = o.arg2 = SLJIT_IMM;
		o.w = (sljit_sw)(int32_t)(uint32_t)(unsigned long long)v;
		o.w2 = (sljit_sw)(int32_t)(uint32_t)((unsigned long long)v >> 32);
	} else if (*p == 'r' || (*p == 's' && p[1] != 'p')) {
		int i = reg_index(p, *p, *p == 'r' ? cur->scratches : cur->saveds, *p == 'r' ? "scratches" : "saveds");
		if (*p == 's' && i == 0) {   /* the root stack's pointer: S1, one word */
			o.arg = RS;
			o.arg2 = SLJIT_IMM;
			o.narrow = 1;
			return o;
		}
		o.arg = o.arg2 = SLJIT_MEM1(SLJIT_SP);
		o.w = slot(*p, i);
		o.w2 = o.w + 4;
	} else if (!strncmp(p, "[sp+", 4)) {
		char *end;
		long off = strtol(p + 4, &end, 10);
		if (*end != ']' || off < 0 || off % 8 || off + 8 > cur->local)
			die("bad frame operand '%s' (local=%d)", p, cur->local);
		o.arg = o.arg2 = SLJIT_MEM1(SLJIT_SP);
		o.w = homes() + off;
		o.w2 = o.w + 4;
	} else if (!strncmp(p, "[@", 2)) {   /* a runtime global: its address from the table */
		size_t n = strcspn(p + 2, "]");
		for (size_t i = 0; i < sizeof globals / sizeof globals[0]; i++)
			if (strlen(globals[i].name) == n && !strncmp(globals[i].name, p + 2, n)) {
				sljit_s32 a = addr_temp();
				load_table(C, a, table_entry(SYM_GLOBAL, globals[i].name));
				o.arg = o.arg2 = SLJIT_MEM1(a);
				o.w = 0;
				o.w2 = 4;
				/* the heap's and root stack's pointers are C pointers: one word on rv32 */
				o.narrow = strcmp(globals[i].name, "exc_flag") && strcmp(globals[i].name, "exc_value");
				return o;
			}
		die("unknown global '%s'", p);
	} else if (*p == '[' && (p[1] == 'r' || p[1] == 's')) {   /* [r1+16], [s0-8]: the base's low word */
		char *end;
		int i;
		long off;
		sljit_s32 a;
		i = reg_index(p + 1, p[1], p[1] == 'r' ? cur->scratches : cur->saveds, p[1] == 'r' ? "scratches" : "saveds");
		end = p + 2 + strspn(p + 2, "0123456789");
		if (*end != '+' && *end != '-')
			die("bad memory operand '%s'", p);
		off = strtol(end, &end, 10);
		if (*end != ']')
			die("bad memory operand '%s'", p);
		if (p[1] == 's' && i == 0)   /* [s0-8]: the root stack, from S1 */
			a = RS;
		else {
			a = addr_temp();
			sljit_emit_op1(C, SLJIT_MOV, a, 0, SLJIT_MEM1(SLJIT_SP), slot(p[1], i));
		}
		o.arg = o.arg2 = SLJIT_MEM1(a);
		o.w = off;
		o.w2 = off + 4;
	} else {
		die("bad operand '%s'", p);
	}
	return o;
}

static void load_pair(struct sljit_compiler *C, P p, sljit_s32 lo, sljit_s32 hi)
{
	sljit_emit_op1(C, SLJIT_MOV, lo, 0, p.arg, p.w);
	if (p.narrow)
		sljit_emit_op1(C, SLJIT_MOV, hi, 0, SLJIT_IMM, 0);
	else
		sljit_emit_op1(C, SLJIT_MOV, hi, 0, p.arg2, p.w2);
}
static void store_pair(struct sljit_compiler *C, P p, sljit_s32 lo, sljit_s32 hi)
{
	if (p.arg == SLJIT_IMM)
		die("an instruction cannot write to an immediate");
	sljit_emit_op1(C, SLJIT_MOV, p.arg, p.w, lo, 0);
	if (!p.narrow)
		sljit_emit_op1(C, SLJIT_MOV, p.arg2, p.w2, hi, 0);
}
/* a SLIR register's pair, straight from its frame home */
static void load_reg(struct sljit_compiler *C, char kind, int i, sljit_s32 lo, sljit_s32 hi)
{
	sljit_emit_op1(C, SLJIT_MOV, lo, 0, SLJIT_MEM1(SLJIT_SP), slot(kind, i));
	sljit_emit_op1(C, SLJIT_MOV, hi, 0, SLJIT_MEM1(SLJIT_SP), slot(kind, i) + 4);
}
static void store_reg(struct sljit_compiler *C, char kind, int i, sljit_s32 lo, sljit_s32 hi)
{
	sljit_emit_op1(C, SLJIT_MOV, SLJIT_MEM1(SLJIT_SP), slot(kind, i), lo, 0);
	sljit_emit_op1(C, SLJIT_MOV, SLJIT_MEM1(SLJIT_SP), slot(kind, i) + 4, hi, 0);
}

/* a call to a C function by its address in the table: a SLIR word per argument, pairs from a0 */
static void c_call(struct sljit_compiler *C, int k, int nwords, int returns)
{
	load_table(C, SLJIT_R8, k);
	sljit_emit_icall(C, SLJIT_CALL, arg_types(nwords < 4 ? nwords : 4, returns), SLJIT_R8, 0);
}
static P rv_operand(struct sljit_compiler *C, char *p);
/* d = f(a, b) through a C helper on two words (d's address is found after the call, which
   clobbers the address registers) */
static void helper2(struct sljit_compiler *C, const char *fn, char *d, P a, P b)
{
	load_pair(C, a, SLJIT_R0, SLJIT_R1);
	load_pair(C, b, SLJIT_R2, SLJIT_R3);
	c_call(C, table_entry(SYM_EXT, fn), 4, 1);
	addr_temps = 0;
	store_pair(C, rv_operand(C, d), SLJIT_R0, SLJIT_R1);
}

/* the condition of a 64-bit signed comparison of (R1:R0) with (R3:R2), as 0 or 1 in R0 */
static void compare_pair(struct sljit_compiler *C, const char *cond)
{
	if (!strcmp(cond, "eq") || !strcmp(cond, "ne")) {
		sljit_emit_op2(C, SLJIT_XOR, SLJIT_R0, 0, SLJIT_R0, 0, SLJIT_R2, 0);
		sljit_emit_op2(C, SLJIT_XOR, SLJIT_R1, 0, SLJIT_R1, 0, SLJIT_R3, 0);
		sljit_emit_op2(C, SLJIT_OR | SLJIT_SET_Z, SLJIT_R0, 0, SLJIT_R0, 0, SLJIT_R1, 0);
		sljit_emit_op_flags(C, SLJIT_MOV, SLJIT_R0, 0, cond[0] == 'e' ? SLJIT_ZERO : SLJIT_NOT_ZERO);
		return;
	}
	/* hi decides unless the highs are equal; then lo decides, unsigned */
	int lt = cond[0] == 'l', eq_ok = cond[1] == 'e';
	sljit_emit_op2u(C, SLJIT_SUB | (lt ? SLJIT_SET_SIG_LESS : SLJIT_SET_SIG_GREATER), SLJIT_R1, 0, SLJIT_R3, 0);
	sljit_emit_op_flags(C, SLJIT_MOV, SLJIT_R4, 0, lt ? SLJIT_SIG_LESS : SLJIT_SIG_GREATER);
	sljit_emit_op2u(C, SLJIT_SUB | SLJIT_SET_Z, SLJIT_R1, 0, SLJIT_R3, 0);
	sljit_emit_op_flags(C, SLJIT_MOV, SLJIT_R5, 0, SLJIT_EQUAL);
	{
		sljit_s32 t = lt ? (eq_ok ? SLJIT_LESS_EQUAL : SLJIT_LESS) : (eq_ok ? SLJIT_GREATER_EQUAL : SLJIT_GREATER);
		sljit_s32 f = lt ? (eq_ok ? SLJIT_SET_LESS_EQUAL : SLJIT_SET_LESS) : (eq_ok ? SLJIT_SET_GREATER_EQUAL : SLJIT_SET_GREATER);
		sljit_emit_op2u(C, SLJIT_SUB | f, SLJIT_R0, 0, SLJIT_R2, 0);
		sljit_emit_op_flags(C, SLJIT_MOV, SLJIT_R6, 0, t);
	}
	sljit_emit_op2(C, SLJIT_AND, SLJIT_R5, 0, SLJIT_R5, 0, SLJIT_R6, 0);
	sljit_emit_op2(C, SLJIT_OR, SLJIT_R0, 0, SLJIT_R4, 0, SLJIT_R5, 0);
}

/* a double comparison through the firmware's helper, as 0 or 1 in R0 (NaN: false, but true for ne) */
static void compare_double(struct sljit_compiler *C, const char *cond)
{
	static const struct { const char *name, *fn; sljit_s32 type; } t[] = {
		{ "eq", "__eqdf2", SLJIT_EQUAL }, { "ne", "__nedf2", SLJIT_NOT_EQUAL },
		{ "lt", "__ltdf2", SLJIT_SIG_LESS }, { "le", "__ledf2", SLJIT_SIG_LESS_EQUAL },
		{ "gt", "__gtdf2", SLJIT_SIG_GREATER }, { "ge", "__gedf2", SLJIT_SIG_GREATER_EQUAL },
	};
	for (size_t i = 0; i < sizeof t / sizeof t[0]; i++)
		if (!strcmp(cond, t[i].name)) {
			c_call(C, table_entry(SYM_EXT, t[i].fn), 4, 1);
			sljit_emit_op2u(C, SLJIT_SUB | (t[i].type == SLJIT_EQUAL || t[i].type == SLJIT_NOT_EQUAL ? SLJIT_SET_Z
				: t[i].type == SLJIT_SIG_LESS ? SLJIT_SET_SIG_LESS : t[i].type == SLJIT_SIG_LESS_EQUAL ? SLJIT_SET_SIG_LESS_EQUAL
				: t[i].type == SLJIT_SIG_GREATER ? SLJIT_SET_SIG_GREATER : SLJIT_SET_SIG_GREATER_EQUAL), SLJIT_R0, 0, SLJIT_IMM, 0);
			sljit_emit_op_flags(C, SLJIT_MOV, SLJIT_R0, 0, t[i].type);
			return;
		}
	die("unknown float condition %s", cond);
}

/* a SLIR call's arguments: SLIR r0..r(n-1), as pairs in R0..R7 */
static void args_to_regs(struct sljit_compiler *C, int n)
{
	if (n > 4)
		die("at most 4 arguments");
	for (int i = 0; i < n; i++)
		load_reg(C, 'r', i, SLJIT_R(2 * i), SLJIT_R(2 * i + 1));
}

static int rt_index(const char *name)
{
	for (size_t i = 0; i < sizeof runtime / sizeof runtime[0]; i++)
		if (!strcmp(runtime[i].name, name))
			return (int)i;
	return -1;
}

static void instruction(struct sljit_compiler *C, char *op, char *rest)
{
	char *ops[4];
	int n;
	P a, b, c;
	const Cond *cc;

	addr_temps = 0;
	ends_block = !strcmp(op, "return") || !strcmp(op, "jump") || !strcmp(op, "tailcall") || !strcmp(op, "tailcallr");
	if (!strcmp(op, "call") || !strcmp(op, "tailcall")) {
		char *name;
		int k = name_and_count(rest, &name), tail = op[0] == 't';
		sljit_s32 type = SLJIT_CALL_REG_ARG | (tail ? SLJIT_CALL_RETURN : 0);
		args_to_regs(C, k);
		if (is_extern('f', name)) {   /* (chapter 28: in the shared unit) */
			load_table(C, SLJIT_R8, table_entry(SYM_FUNC, name));
			sljit_emit_icall(C, type, word_args(2 * k < 4 ? 2 * k : 4, SLJIT_ARG_TYPE_W), SLJIT_R8, 0);
		} else
			call_to(sljit_emit_call(C, type, word_args(2 * k < 4 ? 2 * k : 4, SLJIT_ARG_TYPE_W)), name);
		if (!tail)
			store_reg(C, 'r', 0, SLJIT_R0, SLJIT_R1);
		return;
	}
	if (!strcmp(op, "callr") || !strcmp(op, "tailcallr")) {
		char *target;
		int k = name_and_count(rest, &target), tail = op[0] == 't';
		sljit_s32 type = SLJIT_CALL_REG_ARG | (tail ? SLJIT_CALL_RETURN : 0);
		P f = rv_operand(C, target);
		sljit_emit_op1(C, SLJIT_MOV, SLJIT_R8, 0, f.arg, f.w);
		args_to_regs(C, k);
		sljit_emit_icall(C, type, word_args(2 * k < 4 ? 2 * k : 4, SLJIT_ARG_TYPE_W), SLJIT_R8, 0);
		if (!tail)
			store_reg(C, 'r', 0, SLJIT_R0, SLJIT_R1);
		return;
	}
	if (!strcmp(op, "jump")) {
		rest = skip(rest);
		if (!*rest)
			die("jump needs a label");
		jump_to(sljit_emit_jump(C, SLJIT_JUMP), rest);
		return;
	}
	if (!strcmp(op, "icall")) {   /* a runtime function: SLIR r0..r(n-1) in, r0 out */
		char *slash;
		int i, reg = 0;
		rest = skip(rest);
		slash = strchr(rest, '/');
		if (!slash)
			die("icall needs NAME/NARGS");
		*slash = '\0';
		if ((i = rt_index(rest)) < 0)
			die("unknown runtime function '%s'", rest);
		if (atoi(slash + 1) != runtime[i].nargs)
			die("%s takes %d arguments", rest, runtime[i].nargs);
		for (int k = 0; k < runtime[i].nargs; k++) {
			/* rt_collect(int64_t **top, int64_t bytes): its pointer is one register */
			int pointer = !strcmp(rest, "collect") && k == 0;
			sljit_emit_op1(C, SLJIT_MOV, SLJIT_R(reg), 0, SLJIT_MEM1(SLJIT_SP), slot('r', k));
			if (pointer)
				reg++;
			else {
				sljit_emit_op1(C, SLJIT_MOV, SLJIT_R(reg + 1), 0, SLJIT_MEM1(SLJIT_SP), slot('r', k) + 4);
				reg += 2;
			}
		}
		c_call(C, table_entry(SYM_RT, runtime[i].name), reg, runtime[i].returns);
		if (runtime[i].returns)
			store_reg(C, 'r', 0, SLJIT_R0, SLJIT_R1);
		return;
	}
	if (!strcmp(op, "strref") || !strcmp(op, "shaperef")) {
		char *comma = strchr(rest, ','), *text;
		int k;
		if (!comma)
			die("%s needs a destination and a value", op);
		*comma = '\0';
		ops[0] = skip(rest);
		ops[0][strcspn(ops[0], " \t")] = '\0';
		text = skip(comma + 1);
		text[strcspn(text, "\r\n")] = '\0';
		if (op[1] == 't')
			k = table_entry(SYM_STRING, text);
		else {
			char *t = malloc(strlen(text) + 1);
			if (!t)
				die("out of memory");
			strcpy(t, text);
			static_shape(t);   /* (its names, as string symbols) */
			free(t);
			k = table_entry(SYM_SHAPE, text);
		}
		a = rv_operand(C, ops[0]);
		load_table(C, SLJIT_R0, k);
		sljit_emit_op1(C, SLJIT_MOV, SLJIT_R1, 0, SLJIT_IMM, 0);
		store_pair(C, a, SLJIT_R0, SLJIT_R1);
		return;
	}

	n = split(rest, ops, 4);
	if (!strcmp(op, "mov")) {
		need(n, 2, op);
		b = rv_operand(C, ops[1]);
		load_pair(C, b, SLJIT_R0, SLJIT_R1);
		a = rv_operand(C, ops[0]);
		store_pair(C, a, SLJIT_R0, SLJIT_R1);
		return;
	}
	if (!strcmp(op, "add") && n == 3 && rootstack_check && is_s0(ops[0]) && is_s0(ops[1]) && *skip(ops[2]) == '#'
		&& atol(skip(ops[2]) + 1) > 0) {
		/* CJI-4: a frame pushed onto the root stack (add s0, s0, #N) is checked against its end, so that a world's
		   root stack can be small: past the end, rt_rootstack_overflow is a fatal error (on the board, the world
		   crashes). The prelude has already zeroed the frame's slots, so they may reach N bytes past the end: the
		   embedder keeps CJI_ELF_ROOTSTACK_SLACK bytes there, and no frame may be bigger. A frame never takes the
		   root stack's last word. */
		struct sljit_jump *ok;
		if (atol(skip(ops[2]) + 1) > rootstack_slack)
			die("a frame of %ld bytes on the root stack: more than the %ld its end is allowed to overrun (--rootstack-slack)",
				atol(skip(ops[2]) + 1), rootstack_slack);
		sljit_emit_op2(C, SLJIT_ADD, RS, 0, RS, 0, SLJIT_IMM, atol(skip(ops[2]) + 1));
		load_table(C, SLJIT_R0, table_entry(SYM_EXT, "rootstack_end"));
		sljit_emit_op1(C, SLJIT_MOV, SLJIT_R0, 0, SLJIT_MEM1(SLJIT_R0), 0);
		ok = sljit_emit_cmp(C, SLJIT_LESS, RS, 0, SLJIT_R0, 0);
		c_call(C, table_entry(SYM_EXT, "rt_rootstack_overflow"), 0, 0);
		sljit_set_label(ok, sljit_emit_label(C));
		return;
	}
	if (!strcmp(op, "add") || !strcmp(op, "sub") || !strcmp(op, "and") || !strcmp(op, "or") || !strcmp(op, "xor")) {
		need(n, 3, op);
		b = rv_operand(C, ops[1]);
		c = rv_operand(C, ops[2]);
		load_pair(C, b, SLJIT_R0, SLJIT_R1);
		load_pair(C, c, SLJIT_R2, SLJIT_R3);
		if (op[0] == 'a' && op[1] == 'd') {
			sljit_emit_op2(C, SLJIT_ADD | SLJIT_SET_CARRY, SLJIT_R0, 0, SLJIT_R0, 0, SLJIT_R2, 0);
			sljit_emit_op2(C, SLJIT_ADDC, SLJIT_R1, 0, SLJIT_R1, 0, SLJIT_R3, 0);
		} else if (op[0] == 's') {
			sljit_emit_op2(C, SLJIT_SUB | SLJIT_SET_CARRY, SLJIT_R0, 0, SLJIT_R0, 0, SLJIT_R2, 0);
			sljit_emit_op2(C, SLJIT_SUBC, SLJIT_R1, 0, SLJIT_R1, 0, SLJIT_R3, 0);
		} else {
			sljit_s32 o = op[0] == 'a' ? SLJIT_AND : op[0] == 'o' ? SLJIT_OR : SLJIT_XOR;
			sljit_emit_op2(C, o, SLJIT_R0, 0, SLJIT_R0, 0, SLJIT_R2, 0);
			sljit_emit_op2(C, o, SLJIT_R1, 0, SLJIT_R1, 0, SLJIT_R3, 0);
		}
		a = rv_operand(C, ops[0]);
		store_pair(C, a, SLJIT_R0, SLJIT_R1);
		return;
	}
	if (!strcmp(op, "shl") || !strcmp(op, "shr") || !strcmp(op, "sar")) {
		need(n, 3, op);
		b = rv_operand(C, ops[1]);
		c = rv_operand(C, ops[2]);
		if (c.arg != SLJIT_IMM) {   /* by a register: rt_i64_shl and the rest */
			char fn[16];
			snprintf(fn, sizeof fn, "rt_i64_%s", op);
			helper2(C, fn, ops[0], b, c);
			return;
		}
		{
			int k = (int)(c.w & 63);
			load_pair(C, b, SLJIT_R0, SLJIT_R1);
			if (k == 0)
				;
			else if (op[1] == 'h' && op[2] == 'l') {   /* shl */
				if (k >= 32) {
					sljit_emit_op2(C, SLJIT_SHL, SLJIT_R1, 0, SLJIT_R0, 0, SLJIT_IMM, k - 32);
					sljit_emit_op1(C, SLJIT_MOV, SLJIT_R0, 0, SLJIT_IMM, 0);
				} else {
					sljit_emit_op2(C, SLJIT_LSHR, SLJIT_R2, 0, SLJIT_R0, 0, SLJIT_IMM, 32 - k);
					sljit_emit_op2(C, SLJIT_SHL, SLJIT_R1, 0, SLJIT_R1, 0, SLJIT_IMM, k);
					sljit_emit_op2(C, SLJIT_OR, SLJIT_R1, 0, SLJIT_R1, 0, SLJIT_R2, 0);
					sljit_emit_op2(C, SLJIT_SHL, SLJIT_R0, 0, SLJIT_R0, 0, SLJIT_IMM, k);
				}
			} else {   /* shr, sar */
				sljit_s32 hs = op[1] == 'a' ? SLJIT_ASHR : SLJIT_LSHR;
				if (k >= 32) {
					sljit_emit_op2(C, hs, SLJIT_R0, 0, SLJIT_R1, 0, SLJIT_IMM, k - 32);
					if (op[1] == 'a')
						sljit_emit_op2(C, SLJIT_ASHR, SLJIT_R1, 0, SLJIT_R1, 0, SLJIT_IMM, 31);
					else
						sljit_emit_op1(C, SLJIT_MOV, SLJIT_R1, 0, SLJIT_IMM, 0);
				} else {
					sljit_emit_op2(C, SLJIT_SHL, SLJIT_R2, 0, SLJIT_R1, 0, SLJIT_IMM, 32 - k);
					sljit_emit_op2(C, SLJIT_LSHR, SLJIT_R0, 0, SLJIT_R0, 0, SLJIT_IMM, k);
					sljit_emit_op2(C, SLJIT_OR, SLJIT_R0, 0, SLJIT_R0, 0, SLJIT_R2, 0);
					sljit_emit_op2(C, hs, SLJIT_R1, 0, SLJIT_R1, 0, SLJIT_IMM, k);
				}
			}
			a = rv_operand(C, ops[0]);
			store_pair(C, a, SLJIT_R0, SLJIT_R1);
		}
		return;
	}
	if (!strcmp(op, "mul")) {
		need(n, 3, op);
		b = rv_operand(C, ops[1]);
		c = rv_operand(C, ops[2]);
		helper2(C, "rt_i64_mul", ops[0], b, c);
		return;
	}
	if ((cc = cond_of(op, "set"))) {
		need(n, 3, op);
		b = rv_operand(C, ops[1]);
		c = rv_operand(C, ops[2]);
		load_pair(C, b, SLJIT_R0, SLJIT_R1);
		load_pair(C, c, SLJIT_R2, SLJIT_R3);
		compare_pair(C, cc->name);
		sljit_emit_op1(C, SLJIT_MOV, SLJIT_R1, 0, SLJIT_IMM, 0);
		a = rv_operand(C, ops[0]);
		store_pair(C, a, SLJIT_R0, SLJIT_R1);
		return;
	}
	if ((cc = cond_of(op, "b"))) {
		need(n, 3, op);
		a = rv_operand(C, ops[0]);
		b = rv_operand(C, ops[1]);
		load_pair(C, a, SLJIT_R0, SLJIT_R1);
		load_pair(C, b, SLJIT_R2, SLJIT_R3);
		compare_pair(C, cc->name);
		jump_to(sljit_emit_cmp(C, SLJIT_NOT_EQUAL, SLJIT_R0, 0, SLJIT_IMM, 0), ops[2]);
		return;
	}
	/* doubles (chapter 10): the firmware's soft-float helpers */
	if (!strcmp(op, "fadd") || !strcmp(op, "fsub") || !strcmp(op, "fmul") || !strcmp(op, "fdiv")) {
		char fn[16];
		need(n, 3, op);
		snprintf(fn, sizeof fn, "__%sdf3", op + 1);
		b = rv_operand(C, ops[1]);
		c = rv_operand(C, ops[2]);
		helper2(C, fn, ops[0], b, c);
		return;
	}
	if (!strcmp(op, "fneg")) {   /* the sign bit, in the high word */
		need(n, 2, op);
		b = rv_operand(C, ops[1]);
		load_pair(C, b, SLJIT_R0, SLJIT_R1);
		sljit_emit_op2(C, SLJIT_XOR, SLJIT_R1, 0, SLJIT_R1, 0, SLJIT_IMM, (sljit_sw)0x80000000u);
		a = rv_operand(C, ops[0]);
		store_pair(C, a, SLJIT_R0, SLJIT_R1);
		return;
	}
	if (!strcmp(op, "i2f")) {
		need(n, 2, op);
		b = rv_operand(C, ops[1]);
		load_pair(C, b, SLJIT_R0, SLJIT_R1);
		c_call(C, table_entry(SYM_EXT, "__floatdidf"), 2, 1);
		addr_temps = 0;
		a = rv_operand(C, ops[0]);
		store_pair(C, a, SLJIT_R0, SLJIT_R1);
		return;
	}
	if (!strncmp(op, "fset", 4) || (op[0] == 'f' && op[1] == 'b')) {
		int branch = op[1] == 'b';
		const char *cond = op + (branch ? 2 : 4);
		need(n, 3, op);
		a = rv_operand(C, ops[branch ? 0 : 1]);
		b = rv_operand(C, ops[branch ? 1 : 2]);
		load_pair(C, a, SLJIT_R0, SLJIT_R1);
		load_pair(C, b, SLJIT_R2, SLJIT_R3);
		compare_double(C, cond);
		if (branch)
			jump_to(sljit_emit_cmp(C, SLJIT_NOT_EQUAL, SLJIT_R0, 0, SLJIT_IMM, 0), ops[2]);
		else {
			sljit_emit_op1(C, SLJIT_MOV, SLJIT_R1, 0, SLJIT_IMM, 0);
			addr_temps = 0;   /* (the call clobbered the address registers) */
			c = rv_operand(C, ops[0]);
			store_pair(C, c, SLJIT_R0, SLJIT_R1);
		}
		return;
	}
	if (!strcmp(op, "funref") || !strcmp(op, "closure")) {
		need(n, 2, op);
		load_table(C, SLJIT_R0, op[0] == 'c' ? table_entry(SYM_CLOSURE, ops[1])
			: table_entry(is_extern('f', ops[1]) ? SYM_FUNC : SYM_CODE, ops[1]));
		sljit_emit_op1(C, SLJIT_MOV, SLJIT_R1, 0, SLJIT_IMM, 0);
		a = rv_operand(C, ops[0]);
		store_pair(C, a, SLJIT_R0, SLJIT_R1);
		return;
	}
	if (!strcmp(op, "lea")) {
		need(n, 2, op);
		b = rv_operand(C, ops[1]);
		if (b.arg != SLJIT_MEM1(SLJIT_SP))
			die("lea takes a frame operand [sp+k]");
		sljit_get_local_base(C, SLJIT_R0, 0, b.w);
		sljit_emit_op1(C, SLJIT_MOV, SLJIT_R1, 0, SLJIT_IMM, 0);
		a = rv_operand(C, ops[0]);
		store_pair(C, a, SLJIT_R0, SLJIT_R1);
		return;
	}
	if (!strcmp(op, "return")) {
		need(n, 1, op);
		a = rv_operand(C, ops[0]);
		load_pair(C, a, SLJIT_R0, SLJIT_R1);
		sljit_emit_return(C, SLJIT_MOV, SLJIT_R0, 0);
		return;
	}
	die("unknown instruction '%s' (rv32)", op);
}

/* the table's address into S0: auipc S0, 0; addi S0, S0, 0, patched after generation */
static void table_base(struct sljit_compiler *C)
{
	sljit_u32 rd = (sljit_u32)sljit_get_register_index(SLJIT_GP_REGISTER, TB), ins;
	tb_sites = grow(tb_sites, &tb_sites_cap, ntb_sites, sizeof *tb_sites);
	tb_sites[ntb_sites++].label = sljit_emit_label(C);
	ins = 0x17 | rd << 7;                      /* auipc rd, 0 */
	sljit_emit_op_custom(C, &ins, 4);
	ins = 0x13 | rd << 7 | rd << 15;           /* addi rd, rd, 0 */
	sljit_emit_op_custom(C, &ins, 4);
}

static void header(struct sljit_compiler *C, char *line, Fn *fn)
{
	char *p = skip(line + strlen("function"));
	char *slash = strchr(p, '/');
	size_t len;
	int frame;
	if (!slash)
		die("function header needs NAME/NPARAMS");
	len = (size_t)(slash - p);
	if (len == 0 || len >= sizeof fn->name)
		die("bad function name");
	memcpy(fn->name, p, len);
	fn->name[len] = '\0';
	fn->nparams = atoi(slash + 1);
	fn->scratches = field(line, "scratches=");
	fn->saveds = field(line, "saveds=");
	fn->local = field(line, "local=");
	if (!strncmp(fn->name, "$nat_", 5) && native_roots(fn->name, fn->nparams) && fn->saveds < 1)
		fn->saveds = 1;   /* (CJI-3: an allocating native passes s0 on) */
	if (fn->nparams > 4)
		die("a function takes at most 4 arguments");
	frame = fn->local + 8 * (fn->scratches + fn->saveds);
	fn->entry = sljit_emit_label(C);
	if (!strcmp(fn->name, "main") || !strncmp(fn->name, "$nw", 3)) {
		/* a C entry: main(), or $nw...(closure) with the closure's pair in a0, a1 (S0, S1 after enter) */
		int entry = strncmp(fn->name, "main", 5) != 0;
		if (fn->nparams != 0 && !entry)
			die("main takes no arguments");
		sljit_emit_enter(C, 0, arg_types(entry ? 2 : 0, 1), NSCRATCH, 2, frame);
		if (entry) {
			sljit_emit_op1(C, SLJIT_MOV, SLJIT_MEM1(SLJIT_SP), slot('r', 0), SLJIT_S0, 0);
			sljit_emit_op1(C, SLJIT_MOV, SLJIT_MEM1(SLJIT_SP), slot('r', 0) + 4, SLJIT_S1, 0);
		}
		if (!entry)
			rv32_main_fn = 1;
	} else {
		/* SLIR's convention: the arguments' pairs in R0..R7; they go to the homes of r0..r(n-1) */
		sljit_emit_enter(C, SLJIT_ENTER_REG_ARG, word_args(2 * fn->nparams < 4 ? 2 * fn->nparams : 4, SLJIT_ARG_TYPE_W_R),
			NSCRATCH, 2, frame);
		for (int i = 0; i < fn->nparams; i++)
			store_reg(C, 'r', i, SLJIT_R(2 * i), SLJIT_R(2 * i + 1));
	}
	table_base(C);
}

/* after sljit_generate_code: where each auipc is (slas_load calls this before freeing the compiler) */
static void rv32_generated(void)
{
	for (int i = 0; i < ntb_sites; i++)
		tb_sites[i].addr = sljit_get_label_addr(tb_sites[i].label);
}

