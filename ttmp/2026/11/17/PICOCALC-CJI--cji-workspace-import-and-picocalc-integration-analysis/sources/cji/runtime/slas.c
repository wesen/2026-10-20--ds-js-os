/* slas: the SLIR assembler.
 *
 * Reads a SLIR program (the text cji's print_slir writes), makes one SLJIT call per
 * instruction, generates machine code for the host, and calls `main`. It plays the part the
 * system assembler and linker play in Essentials of Compilation, plus the runtime's
 * entry point.
 *
 *   slas prog.slir         assemble and run
 *   slas -v prog.slir      also print SLJIT's own listing of what it generated (stderr)
 *   slas -x out.bin prog.slir   also write the machine code to out.bin, for a disassembler
 *
 * The text format, one item per line ('; ...' is a comment):
 *
 *   function NAME/NPARAMS scratches=N saveds=N local=BYTES
 *   LABEL:
 *       OP OPERAND, OPERAND, ...
 *   end
 *
 * Operands: #INT, r0..r(N-1), s0..s(N-1), [sp+OFFSET]. Chapter 2 needs mov, add, sub, mul,
 * icall and return. Chapter 4 adds labels other than `start`, `jump L`, the conditional
 * branches `beq bne blt ble bgt bge a, b, L`, the comparisons `seteq ... setge d, a, b`
 * (d = 1 if the condition holds, else 0) and `xor`. A block that does not end in `return`
 * or `jump` falls through to the next one. Comparisons are signed.
 *
 * Chapter 6 adds `shl` and `shr`, memory operands based on a register, [r1+16] or [s0-8],
 * and the runtime's globals, [@free_ptr]. The runtime itself is in runtime.c.
 *
 *   slas -h BYTES prog.slir   start with a heap of BYTES bytes (default 512, so that the
 *                             tests collect garbage often)
 *   slas -g prog.slir         print the collector's statistics on stderr at the end
 *
 * Chapter 7 adds functions with parameters and calls between them. Every function except
 * main uses SLJIT's register-argument convention (SLJIT_ENTER_REG_ARG): its arguments, at
 * most four, arrive in r0..r3, and it is called with SLJIT_CALL_REG_ARG. main is called
 * from C, with no arguments. New instructions: call f/n, callr x/n, tailcall f/n,
 * tailcallr x/n, funref d, f, and lea d, [sp+k]. A call may name a function defined later
 * in the file; calls are resolved at the end.
 *
 * Chapter 8 adds closure d, f: d = the address of f's static closure, a two-word object
 * that slas allocates outside the heap (header, then f's code address, filled in once the
 * code exists). One per function, so that the same function is always the same value.
 * Chapter 9: its header also holds the function's arity (runtime.c), filled in with the
 * code address. */
#define _POSIX_C_SOURCE 200809L   /* (chapter 26: fmemopen) */
#include <ctype.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "sljitLir.h"
#include "runtime.h"
/* chapter 23: a world brings a few hundred functions with its prelude; calc brings more */
#define MAX_FNS 4096

/* ---- the C runtime's functions and globals, by the names SLIR uses ------------------- */

typedef struct Runtime { const char *name; void *fn; int nargs; int returns; } Runtime;

static const Runtime runtime[] = {
	{ "print_int", (void *)rt_print_int, 1, 0 },
	{ "print_bool", (void *)rt_print_bool, 1, 0 },
	{ "collect", (void *)rt_collect, 2, 0 },
	{ "index_error", (void *)rt_index_error, 0, 0 },
	{ "uncaught", (void *)rt_uncaught, 1, 0 },   /* chapter 14 */
	{ "key_hash", (void *)rt_key_hash, 1, 1 },   /* chapter 31: native primitives */
	{ "gc_epoch", (void *)rt_gc_epoch, 0, 1 },
	{ "id_char", (void *)rt_id_char, 2, 1 },   /* CJI-3: the lexer's identifier units */
	/* CJI-3, step 6: the stage-1 compiler's natives. One that allocates takes one argument more
	   than its $nat_ function, the root stack's top, which native_body passes */
	{ "double_bits", (void *)rt_double_bits, 3, 1 },
	{ "read_input", (void *)rt_read_input, 1, 1 },
	{ "write_output", (void *)rt_write_output, 1, 1 },
	{ "arg_native", (void *)rt_arg_native, 0, 1 },
	{ "arg_flag", (void *)rt_arg_flag, 1, 1 },
	{ "arg_value", (void *)rt_arg_value, 2, 1 },
	{ "read_file", (void *)rt_read_file, 2, 1 },
	{ "pass_live", (void *)rt_pass_live, 3, 1 },
	{ "spill_put", (void *)rt_spill_put, 1, 1 },
	{ "spill_get", (void *)rt_spill_get, 2, 1 },
	{ "export", (void *)rt_export, 2, 1 },   /* CJI-3: units compiled on their own */
	{ "import", (void *)rt_import, 2, 1 },
	/* CJI-3, lane 6: packed sets, integer vectors, the interference graph (src/bitsets.js); those
	   that allocate take the root stack's top last (one argument more than their $nat_ function;
	   a $nat_ function has at most three, as compiled code passes a fourth in memory) */
	{ "bits_new", (void *)rt_bits_new, 2, 1 },
	{ "bits_words", (void *)rt_bits_words, 1, 1 },
	{ "bits_has", (void *)rt_bits_has, 2, 1 },
	{ "bits_add", (void *)rt_bits_add, 2, 1 },
	{ "bits_remove", (void *)rt_bits_remove, 2, 1 },
	{ "bits_or", (void *)rt_bits_or, 2, 1 },
	{ "bits_and", (void *)rt_bits_and, 3, 1 },
	{ "bits_equal", (void *)rt_bits_equal, 2, 1 },
	{ "bits_next", (void *)rt_bits_next, 2, 1 },
	{ "bits_first_free", (void *)rt_bits_first_free, 1, 1 },
	{ "bits_grow", (void *)rt_bits_grow, 3, 1 },
	{ "ints_new", (void *)rt_ints_new, 2, 1 },
	{ "ints_length", (void *)rt_ints_length, 1, 1 },
	{ "ints_get", (void *)rt_ints_get, 2, 1 },
	{ "ints_set", (void *)rt_ints_set, 3, 1 },
	{ "bits_add_all", (void *)rt_bits_add_all, 3, 1 },
	{ "bits_remove_all", (void *)rt_bits_remove_all, 3, 1 },
	{ "graph_new", (void *)rt_graph_new, 2, 1 },
	{ "graph_add_live", (void *)rt_graph_add_live, 4, 1 },
	{ "graph_add_cross", (void *)rt_graph_add_cross, 4, 1 },
	{ "graph_row", (void *)rt_graph_row, 3, 1 },
	{ "graph_word", (void *)rt_graph_word, 3, 1 },
	/* chapter 10: numbers and printing several values on a line */
	{ "print_num", (void *)rt_print_num, 1, 0 },
	{ "put_int", (void *)rt_put_int, 1, 0 },
	{ "put_bool", (void *)rt_put_bool, 1, 0 },
	{ "put_num", (void *)rt_put_num, 1, 0 },
	{ "any_put", (void *)rt_any_put, 1, 0 },
	{ "int_mod", (void *)rt_int_mod, 2, 1 },
	{ "num_mod", (void *)rt_num_mod, 2, 1 },
	{ "num_to_int32", (void *)rt_num_to_int32, 1, 1 },
	{ "any_to_int32", (void *)rt_any_to_int32, 1, 1 },
	{ "any_mod", (void *)rt_any_mod, 2, 1 },
	{ "any_to_number", (void *)rt_any_to_number, 1, 1 },
	{ "num_pow", (void *)rt_num_pow, 2, 1 },
	{ "num_to_int", (void *)rt_num_to_int, 1, 1 },
	{ "any_pow", (void *)rt_any_pow, 2, 1 },
	{ "any_loose_eq", (void *)rt_any_loose_eq, 2, 1 },
	/* chapter 10: Math */
	{ "math_floor", (void *)rt_math_floor, 1, 1 },
	{ "math_ceil", (void *)rt_math_ceil, 1, 1 },
	{ "math_round", (void *)rt_math_round, 1, 1 },
	{ "math_trunc", (void *)rt_math_trunc, 1, 1 },
	{ "math_abs", (void *)rt_math_abs, 1, 1 },
	{ "math_sign", (void *)rt_math_sign, 1, 1 },
	{ "math_sqrt", (void *)rt_math_sqrt, 1, 1 },
	{ "math_cbrt", (void *)rt_math_cbrt, 1, 1 },
	{ "math_exp", (void *)rt_math_exp, 1, 1 },
	{ "math_log", (void *)rt_math_log, 1, 1 },
	{ "math_log2", (void *)rt_math_log2, 1, 1 },
	{ "date_now", (void *)rt_date_now, 0, 1 },   /* chapter 21 */
	{ "date_tz", (void *)rt_date_tz, 1, 1 },
	{ "date_clock", (void *)rt_date_clock, 1, 1 },   /* chapter 23 */
	{ "host_arg", (void *)rt_host_arg, 2, 1 },        /* chapter 24 */
	{ "host_call", (void *)rt_host_call, 4, 1 },
	{ "host_event", (void *)rt_host_event, 2, 1 },
	{ "host_entries", (void *)rt_host_entries, 2, 1 },
	{ "math_sinh", (void *)rt_math_sinh, 1, 1 },
	{ "math_cosh", (void *)rt_math_cosh, 1, 1 },
	{ "math_tanh", (void *)rt_math_tanh, 1, 1 },
	{ "math_asinh", (void *)rt_math_asinh, 1, 1 },
	{ "math_acosh", (void *)rt_math_acosh, 1, 1 },
	{ "math_atanh", (void *)rt_math_atanh, 1, 1 },
	{ "math_log10", (void *)rt_math_log10, 1, 1 },
	{ "math_sin", (void *)rt_math_sin, 1, 1 },
	{ "math_cos", (void *)rt_math_cos, 1, 1 },
	{ "math_tan", (void *)rt_math_tan, 1, 1 },
	{ "math_atan", (void *)rt_math_atan, 1, 1 },
	{ "math_asin", (void *)rt_math_asin, 1, 1 },
	{ "math_acos", (void *)rt_math_acos, 1, 1 },
	{ "math_fround", (void *)rt_math_fround, 1, 1 },
	{ "int_abs", (void *)rt_int_abs, 1, 1 },
	{ "int_sign", (void *)rt_int_sign, 1, 1 },
	{ "math_clz32", (void *)rt_math_clz32, 1, 1 },
	{ "math_atan2", (void *)rt_math_atan2, 2, 1 },
	{ "math_hypot", (void *)rt_math_hypot, 2, 1 },
	{ "num_min", (void *)rt_num_min, 2, 1 },
	{ "num_max", (void *)rt_num_max, 2, 1 },
	{ "int_min", (void *)rt_int_min, 2, 1 },
	{ "int_max", (void *)rt_int_max, 2, 1 },
	{ "math_imul", (void *)rt_math_imul, 2, 1 },
	/* chapter 9: dynamic values */
	{ "any_add", (void *)rt_any_add, 3, 1 },   /* chapter 13: + of strings allocates */
	/* chapter 13: strings and records (a last argument int64_t *roots for those that allocate) */
	{ "print_str", (void *)rt_print_str, 1, 0 },
	{ "put_str", (void *)rt_put_str, 1, 0 },
	{ "str_concat", (void *)rt_str_concat, 3, 1 },
	{ "str_eq", (void *)rt_str_eq, 2, 1 },
	{ "str_cmp", (void *)rt_str_cmp, 2, 1 },
	{ "str_index", (void *)rt_str_index, 3, 1 },
	{ "int_to_str", (void *)rt_int_to_str, 2, 1 },
	{ "num_to_radix", (void *)rt_num_to_radix, 3, 1 },   /* chapter 14 */
	{ "num_to_fixed", (void *)rt_num_to_fixed, 3, 1 },   /* chapter 21 */
	{ "num_to_precision", (void *)rt_num_to_precision, 3, 1 },
	{ "arr_resize", (void *)rt_arr_resize, 4, 1 },       /* chapter 15 */
	{ "any_is_array", (void *)rt_any_is_array, 1, 1 },
	{ "any_length", (void *)rt_any_length, 1, 1 },
	{ "any_arity", (void *)rt_any_arity, 1, 1 },
	{ "any_unhole", (void *)rt_any_unhole, 1, 1 },   /* chapter 20 */
	{ "num_to_str", (void *)rt_num_to_str, 2, 1 },
	{ "bool_to_str", (void *)rt_bool_to_str, 1, 1 },
	{ "any_to_str", (void *)rt_any_to_str, 2, 1 },
	{ "any_as_str", (void *)rt_any_as_str, 1, 1 },
	{ "any_typeof_str", (void *)rt_any_typeof_str, 1, 1 },
	{ "str_fromCharCode", (void *)rt_str_fromCharCode, 2, 1 },
	{ "arr_join", (void *)rt_arr_join, 4, 1 },
	{ "any_get", (void *)rt_any_get, 2, 1 },
	{ "any_set", (void *)rt_any_set, 4, 1 },
	{ "any_index", (void *)rt_any_index, 3, 1 },          /* chapter 19 */
	{ "any_set_index", (void *)rt_any_set_index, 4, 1 },
	{ "any_delete", (void *)rt_any_delete, 3, 1 },
	{ "any_in", (void *)rt_any_in, 3, 1 },
	{ "any_keys", (void *)rt_any_keys, 2, 1 },
	{ "any_to_record", (void *)rt_any_to_record, 2, 1 },
	{ "str_charAt", (void *)rt_str_charAt, 3, 1 },
	{ "str_charCodeAt", (void *)rt_str_charCodeAt, 2, 1 },
	{ "str_indexOf", (void *)rt_str_indexOf, 3, 1 },
	{ "str_lastIndexOf", (void *)rt_str_lastIndexOf, 3, 1 },
	{ "str_includes", (void *)rt_str_includes, 3, 1 },
	{ "str_startsWith", (void *)rt_str_startsWith, 3, 1 },
	{ "str_endsWith", (void *)rt_str_endsWith, 3, 1 },
	{ "str_slice", (void *)rt_str_slice, 4, 1 },
	{ "str_substring", (void *)rt_str_substring, 4, 1 },
	{ "str_toUpperCase", (void *)rt_str_toUpperCase, 2, 1 },
	{ "str_toLowerCase", (void *)rt_str_toLowerCase, 2, 1 },
	{ "str_trim", (void *)rt_str_trim, 3, 1 },
	{ "str_repeat", (void *)rt_str_repeat, 3, 1 },
	{ "str_padStart", (void *)rt_str_padStart, 4, 1 },
	{ "str_padEnd", (void *)rt_str_padEnd, 4, 1 },
	{ "str_split", (void *)rt_str_split, 3, 1 },
	{ "any_sub", (void *)rt_any_sub, 2, 1 },
	{ "any_mul", (void *)rt_any_mul, 2, 1 },
	{ "any_div", (void *)rt_any_div, 2, 1 },
	{ "any_neg", (void *)rt_any_neg, 1, 1 },
	{ "any_lt", (void *)rt_any_lt, 2, 1 },
	{ "any_le", (void *)rt_any_le, 2, 1 },
	{ "any_gt", (void *)rt_any_gt, 2, 1 },
	{ "any_ge", (void *)rt_any_ge, 2, 1 },
	{ "any_eq", (void *)rt_any_eq, 2, 1 },
	{ "any_truthy", (void *)rt_any_truthy, 1, 1 },
	{ "any_typeof", (void *)rt_any_typeof, 1, 1 },
	{ "any_from_int", (void *)rt_any_from_int, 1, 1 },
	{ "any_to_int", (void *)rt_any_to_int, 1, 1 },
	{ "any_to_bool", (void *)rt_any_to_bool, 1, 1 },
	{ "any_to_array", (void *)rt_any_to_array, 1, 1 },
	{ "any_to_function", (void *)rt_any_to_function, 2, 1 },
	{ "any_print", (void *)rt_any_print, 1, 0 },
};

/* Chapter 31, CJI-3: does the native primitive $nat_NAME.../nparams (its closure, then its
 * arguments) allocate? Then rt_NAME takes one argument more, the root stack's top (s0), as the
 * runtime's allocating operators do, and the function needs s0. */
static int native_roots(const char *fname, int nparams)
{
	int len = (int)strcspn(fname + 5, ".");
	for (size_t i = 0; i < sizeof runtime / sizeof runtime[0]; i++)
		if ((int)strlen(runtime[i].name) == len && !strncmp(runtime[i].name, fname + 5, (size_t)len))
			return runtime[i].nargs == nparams;   /* (nparams - 1 arguments, and the roots) */
	return 0;
}

typedef struct Global { const char *name; void *addr; } Global;

static const Global globals[] = {
	{ "free_ptr", &free_ptr },
	{ "fromspace_begin", &fromspace_begin },
	{ "fromspace_end", &fromspace_end },
	{ "rootstack_begin", &rootstack_begin },
	{ "exc_flag", &exc_flag },   /* chapter 14 */
	{ "exc_value", &exc_value },
};

/* ---- errors -------------------------------------------------------------------------- */

static const char *src_name;
static int src_line;

static void die(const char *fmt, ...)
{
	va_list ap;
	fprintf(stderr, "slas: %s:%d: ", src_name ? src_name : "(world)", src_line);
	va_start(ap, fmt);
	vfprintf(stderr, fmt, ap);
	va_end(ap);
	fputc('\n', stderr);
	exit(2);
}

/* ---- operands ------------------------------------------------------------------------ */

/* ---- Chapter 26: ahead of time, the addresses --------------------------------------------
 * In an AOT pass (slas -c), every address the code would hold of something outside it (a
 * runtime function, a runtime global, a static string, shape or closure) is a stand-in:
 * symbol i is at aot_addr(i), a different base in each of the two passes, far from any code,
 * so that SLJIT always encodes it as a full 64-bit immediate. Comparing the two passes' code
 * finds every such field (and every absolute address of the code itself). */
enum { SYM_RT, SYM_GLOBAL, SYM_STRING, SYM_SHAPE, SYM_CLOSURE, SYM_FUNC };   /* (SYM_FUNC: chapter 28) */
typedef struct AotSym {
	int kind;
	char *text;           /* a C name (runtime function, global), a JSON literal, or a function's name */
	int names[64], nnames, error, parsed;   /* a shape: its names (string symbols), and whether an Error's */
	int ext;              /* chapter 28: defined by the shared unit (--extern), not here */
} AotSym;
/* Chapter 28: the units of a set of worlds. `slas -c shared.o --lib LIST shared.slir` assembles
 * the functions several worlds have in common and exports each of them, and each literal they
 * use, under a name every unit can compute (cji_f_NAME, cji_s_HASH, cji_h_HASH, cji_c_NAME);
 * LIST is what it exports. `slas -c world.o --extern LIST world.slir` assembles a world without
 * those functions and literals: a call to one is a call through its symbol. */
static int lib_mode;
static const char *lib_list;
static char **ext_keys;   /* "f NAME", "s JSON", "h JSON", "c NAME", sorted */
static int next_keys;
static int key_cmp(const void *a, const void *b) { return strcmp(*(char *const *)a, *(char *const *)b); }
static int is_extern(char kind, const char *text)
{
	char buf[1 << 12], *key = buf;
	if (!next_keys || strlen(text) + 3 > sizeof buf)
		return 0;
	snprintf(buf, sizeof buf, "%c %s", kind, text);
	return bsearch(&key, ext_keys, (size_t)next_keys, sizeof *ext_keys, key_cmp) != NULL;
}
static void read_externs(const char *path)
{
	FILE *f = fopen(path, "r");
	char line[1 << 12];
	int cap = 0;
	if (!f) {
		perror(path);
		exit(2);
	}
	while (fgets(line, sizeof line, f)) {
		line[strcspn(line, "\r\n")] = '\0';
		if (!line[0])
			continue;
		if (next_keys == cap && !(ext_keys = realloc(ext_keys, sizeof *ext_keys * (size_t)(cap = 2 * cap + 256))))
			die("out of memory");
		if (!(ext_keys[next_keys] = malloc(strlen(line) + 1)))
			die("out of memory");
		strcpy(ext_keys[next_keys++], line);
	}
	fclose(f);
	qsort(ext_keys, (size_t)next_keys, sizeof *ext_keys, key_cmp);
}
/* a literal's symbol name: its kind and a hash of its text (FNV-1a, 64 bits) */
static void sym_name(char *out, size_t n, const AotSym *y)
{
	uint64_t h = 1469598103934665603ull;
	for (const char *p = y->text; *p; p++)
		h = (h ^ (unsigned char)*p) * 1099511628211ull;
	if (y->kind == SYM_RT)
		snprintf(out, n, "rt_%s", y->text);
	else if (y->kind == SYM_GLOBAL)
		snprintf(out, n, "%s", y->text);
	else if (y->kind == SYM_FUNC)
		snprintf(out, n, "cji_f_%s", y->text);
	else if (y->kind == SYM_CLOSURE)
		snprintf(out, n, "cji_c_%s", y->text);
	else
		snprintf(out, n, "cji_%c_%016llx", y->kind == SYM_STRING ? 's' : 'h', (unsigned long long)h);
}
/* a symbol the object names rather than defines */
static int by_symbol(const AotSym *y)
{
	return y->kind == SYM_RT || y->kind == SYM_GLOBAL || y->kind == SYM_FUNC || y->ext;
}
static int aot;   /* 0: JIT; 1, 2: the AOT passes */
static AotSym *aot_syms;
static int naot_syms, aot_syms_cap;
#define AOT_BASE_A 0x100000000000LL
#define AOT_BASE_B 0x200000000000LL
#define AOT_STRIDE 0x10000LL
static sljit_sw aot_addr(int i) { return (aot == 2 ? AOT_BASE_B : AOT_BASE_A) + (sljit_sw)i * AOT_STRIDE; }
static void *grow(void *p, int *cap, int n, size_t size);
static int aot_sym(int kind, const char *text)
{
	for (int i = 0; i < naot_syms; i++)
		if (aot_syms[i].kind == kind && !strcmp(aot_syms[i].text, text))
			return i;
	aot_syms = grow(aot_syms, &aot_syms_cap, naot_syms, sizeof *aot_syms);
	memset(&aot_syms[naot_syms], 0, sizeof *aot_syms);
	aot_syms[naot_syms].kind = kind;
	aot_syms[naot_syms].ext = kind == SYM_FUNC || (kind == SYM_STRING && is_extern('s', text))
		|| (kind == SYM_SHAPE && is_extern('h', text)) || (kind == SYM_CLOSURE && is_extern('c', text));
	aot_syms[naot_syms].text = malloc(strlen(text) + 1);
	if (!aot_syms[naot_syms].text)
		die("out of memory");
	strcpy(aot_syms[naot_syms].text, text);
	return naot_syms++;
}

typedef struct Fn {
	char name[64];
	int nparams, scratches, saveds, local;
	struct sljit_label *entry;
	sljit_uw addr;   /* (chapter 26: the entry's address, kept when the compiler is freed) */
} Fn;

static Fn *cur;   /* the function being assembled */

/* Labels of the current function, and jumps waiting for a label that may come later. */
/* (chapter 24: every table grows as it fills, so that slas embedded in a native world holds only
   what the program needs: a world has a memory limit) */
static void *grow(void *p, int *cap, int n, size_t size)
{
	if (n < *cap)
		return p;
	*cap = *cap ? 2 * *cap : 64;
	p = realloc(p, (size_t)*cap * size);
	if (!p)
		die("out of memory");
	return p;
}
static struct { char name[64]; struct sljit_label *label; } *labels;
static struct { char name[64]; struct sljit_jump *jump; int line; } *pending;
static int nlabels, npending, labels_cap, pending_cap;
static int ends_block;   /* the last instruction was return, jump or a tail call */

/* Calls and function addresses, resolved when every function's entry is known. */
static struct { char name[64]; struct sljit_jump *jump; int line; } *calls;
static int ncalls, calls_cap;

static void call_to(struct sljit_jump *j, const char *name)
{
	if (strlen(name) >= sizeof calls[0].name)
		die("a function name too long");
	calls = grow(calls, &calls_cap, ncalls, sizeof *calls);
	strcpy(calls[ncalls].name, name);
	calls[ncalls].line = src_line;
	calls[ncalls++].jump = j;
}

/* Static closures: one per function named by a closure instruction. */
static struct { char name[64]; int64_t *obj; } *statics;
static int nstatics, statics_cap;
static int keep_statics;   /* (CJI-3: while a snapshot is taken, which names the static closures it meets) */

static void free_statics(void)
{
	free(statics);
	statics = NULL;
	statics_cap = nstatics = 0;
}

static int64_t *static_closure(const char *name)
{
	if (aot)   /* (chapter 26) */
		return (int64_t *)aot_addr(aot_sym(SYM_CLOSURE, name));
	for (int i = 0; i < nstatics; i++)
		if (!strcmp(statics[i].name, name))
			return statics[i].obj;
	if (strlen(name) >= sizeof statics[0].name)
		die("a function name too long");
	statics = grow(statics, &statics_cap, nstatics, sizeof *statics);
	strcpy(statics[nstatics].name, name);
	statics[nstatics].obj = malloc(16);
	statics[nstatics].obj[0] = 1 * 8 + 2 * 2 + 1;   /* one field, kind 2 (mask 0): runtime.c */
	statics[nstatics].obj[1] = 0;                    /* the code address, once there is code */
	return statics[nstatics++].obj;
}

/* The SLJIT argument types of a call or an entry with n word arguments. */
static sljit_s32 word_args(int n, sljit_s32 type)
{
	sljit_s32 t = SLJIT_ARG_RETURN(SLJIT_ARG_TYPE_W);
	for (int i = 1; i <= n; i++)
		t |= SLJIT_ARG_VALUE(type, i);
	return t;
}

static char *skip(char *p);

/* "f/3" -> the name and the argument count */
static int name_and_count(char *p, char **name)
{
	char *slash;
	p = skip(p);
	slash = strchr(p, '/');
	if (!slash)
		die("expected NAME/NARGS");
	*slash = '\0';
	*name = p;
	return atoi(slash + 1);
}

static void define_label(struct sljit_compiler *C, const char *name)
{
	for (int i = 0; i < nlabels; i++)
		if (!strcmp(labels[i].name, name))
			die("label %s is defined twice", name);
	if (strlen(name) >= sizeof labels[0].name)
		die("a label name too long");
	labels = grow(labels, &labels_cap, nlabels, sizeof *labels);
	strcpy(labels[nlabels].name, name);
	labels[nlabels++].label = sljit_emit_label(C);
}

static void jump_to(struct sljit_jump *j, const char *name)
{
	if (strlen(name) >= sizeof pending[0].name)
		die("a label name too long");
	pending = grow(pending, &pending_cap, npending, sizeof *pending);
	strcpy(pending[npending].name, name);
	pending[npending].line = src_line;
	pending[npending++].jump = j;
}

/* At `end`: every jump gets its label. */
static void resolve_jumps(void)
{
	for (int i = 0; i < npending; i++) {
		int k = 0;
		while (k < nlabels && strcmp(labels[k].name, pending[i].name))
			k++;
		if (k == nlabels) {
			src_line = pending[i].line;
			die("jump to undefined label %s", pending[i].name);
		}
		sljit_set_label(pending[i].jump, labels[k].label);
	}
	nlabels = npending = 0;
}

/* Condition codes: the jump type, and the flag a comparison must set for it. */
typedef struct Cond { const char *name; sljit_s32 type, flag; } Cond;

static const Cond conds[] = {
	{ "eq", SLJIT_EQUAL, SLJIT_SET_Z },
	{ "ne", SLJIT_NOT_EQUAL, SLJIT_SET_Z },
	{ "lt", SLJIT_SIG_LESS, SLJIT_SET_SIG_LESS },
	{ "le", SLJIT_SIG_LESS_EQUAL, SLJIT_SET_SIG_LESS_EQUAL },
	{ "gt", SLJIT_SIG_GREATER, SLJIT_SET_SIG_GREATER },
	{ "ge", SLJIT_SIG_GREATER_EQUAL, SLJIT_SET_SIG_GREATER_EQUAL },
};

/* Chapter 10: the same six on doubles, where a comparison with NaN is false, so != is
 * "unordered or not equal". A float comparison sets its flag with CMP_F64. */
static const Cond fconds[] = {
	{ "eq", SLJIT_ORDERED_EQUAL, SLJIT_SET_ORDERED_EQUAL },
	{ "ne", SLJIT_UNORDERED_OR_NOT_EQUAL, SLJIT_SET_UNORDERED_OR_NOT_EQUAL },
	{ "lt", SLJIT_ORDERED_LESS, SLJIT_SET_ORDERED_LESS },
	{ "le", SLJIT_ORDERED_LESS_EQUAL, SLJIT_SET_ORDERED_LESS_EQUAL },
	{ "gt", SLJIT_ORDERED_GREATER, SLJIT_SET_ORDERED_GREATER },
	{ "ge", SLJIT_ORDERED_GREATER_EQUAL, SLJIT_SET_ORDERED_GREATER_EQUAL },
};

static const Cond *fcond_of(const char *op, const char *prefix)
{
	size_t n = strlen(prefix);
	if (strncmp(op, prefix, n))
		return NULL;
	for (size_t i = 0; i < sizeof fconds / sizeof fconds[0]; i++)
		if (!strcmp(op + n, fconds[i].name))
			return &fconds[i];
	return NULL;
}

/* "blt" with prefix "b" gives the entry for lt; NULL if op is not prefix + condition. */
static const Cond *cond_of(const char *op, const char *prefix)
{
	size_t n = strlen(prefix);
	if (strncmp(op, prefix, n))
		return NULL;
	for (size_t i = 0; i < sizeof conds / sizeof conds[0]; i++)
		if (!strcmp(op + n, conds[i].name))
			return &conds[i];
	return NULL;
}

typedef struct Opnd { sljit_s32 arg; sljit_sw w; } Opnd;

static char *skip(char *p)
{
	while (*p == ' ' || *p == '\t')
		p++;
	return p;
}

static int reg_index(const char *p, char kind, int limit, const char *what)
{
	char *end;
	long n = strtol(p + 1, &end, 10);
	if (end == p + 1 || n < 0)
		die("bad register '%s'", p);
	if (n >= limit)
		die("%c%ld used, but the function declares %s=%d", kind, n, what, limit);
	return (int)n;
}

#ifndef CJI_RV32   /* (chapter 29: rv32.c has its own operands and instructions) */
static Opnd operand(char *p)
{
	Opnd o;
	p = skip(p);
	if (*p == '#') {
		char *end;
		o.arg = SLJIT_IMM;
		o.w = (sljit_sw)strtoll(p + 1, &end, 10);
		if (end == p + 1)
			die("bad immediate '%s'", p);
	} else if (*p == 'r') {
		o.arg = SLJIT_R(reg_index(p, 'r', cur->scratches, "scratches"));
		o.w = 0;
	} else if (*p == 's' && p[1] != 'p') {
		o.arg = SLJIT_S(reg_index(p, 's', cur->saveds, "saveds"));
		o.w = 0;
	} else if (!strncmp(p, "[sp+", 4)) {
		char *end;
		long off = strtol(p + 4, &end, 10);
		if (*end != ']' || off < 0 || off % 8 || off + 8 > cur->local)
			die("bad frame operand '%s' (local=%d)", p, cur->local);
		o.arg = SLJIT_MEM1(SLJIT_SP);
		o.w = off;
	} else if (!strncmp(p, "[@", 2)) {   /* a runtime global, by absolute address */
		size_t n = strcspn(p + 2, "]");
		for (size_t i = 0; i < sizeof globals / sizeof globals[0]; i++)
			if (strlen(globals[i].name) == n && !strncmp(globals[i].name, p + 2, n)) {
				o.arg = SLJIT_MEM0();
				o.w = aot ? aot_addr(aot_sym(SYM_GLOBAL, globals[i].name)) : (sljit_sw)globals[i].addr;
				return o;
			}
		die("unknown global '%s'", p);
	} else if (*p == '[' && (p[1] == 'r' || p[1] == 's')) {   /* [r1+16], [s0-8] */
		char *end;
		Opnd base = operand(p + 1);
		long off;
		end = p + 2 + strspn(p + 2, "0123456789");
		if (*end != '+' && *end != '-')
			die("bad memory operand '%s'", p);
		off = strtol(end, &end, 10);
		if (*end != ']')
			die("bad memory operand '%s'", p);
		o.arg = SLJIT_MEM1(base.arg);
		o.w = off;
	} else {
		die("bad operand '%s'", p);
	}
	return o;
}

#endif /* !CJI_RV32 */

/* Splits "a, b, c" in place into at most max operands; returns how many. */
static int split(char *p, char **ops, int max)
{
	int n = 0;
	p = skip(p);
	if (!*p)
		return 0;
	for (;;) {
		char *comma = strchr(p, ',');
		if (n == max)
			die("too many operands");
		ops[n++] = p;
		if (!comma)
			break;
		*comma = '\0';
		p = skip(comma + 1);
	}
	for (int i = 0; i < n; i++) {   /* trim trailing spaces */
		char *e = ops[i] + strlen(ops[i]);
		while (e > ops[i] && isspace((unsigned char)e[-1]))
			*--e = '\0';
	}
	return n;
}

/* ---- instructions -------------------------------------------------------------------- */

static void need(int got, int want, const char *op)
{
	if (got != want)
		die("%s takes %d operands, got %d", op, want, got);
}

static sljit_s32 arg_types(int nargs, int returns)
{
	sljit_s32 t = returns ? SLJIT_ARG_RETURN(SLJIT_ARG_TYPE_W) : SLJIT_ARG_RETURN(SLJIT_ARG_TYPE_RET_VOID);
	for (int i = 1; i <= nargs; i++)
		t |= SLJIT_ARG_VALUE(SLJIT_ARG_TYPE_W, i);
	return t;
}

/* The two-operand arithmetic instructions: d = a op b. */
static sljit_s32 op2_of(const char *op)
{
	static const struct { const char *name; sljit_s32 op; } ops[] = {
		{ "add", SLJIT_ADD }, { "sub", SLJIT_SUB }, { "mul", SLJIT_MUL }, { "xor", SLJIT_XOR },
		{ "shl", SLJIT_SHL }, { "shr", SLJIT_LSHR },
		{ "and", SLJIT_AND }, { "or", SLJIT_OR }, { "sar", SLJIT_ASHR },   /* chapter 10 */
	};
	for (size_t i = 0; i < sizeof ops / sizeof ops[0]; i++)
		if (!strcmp(op, ops[i].name))
			return ops[i].op;
	return 0;
}

#ifndef CJI_RV32
/* ---- chapter 10: doubles ----------------------------------------------------------------
 * A double lives in an ordinary word: an integer register, a frame or heap slot, or an
 * immediate, holding its 64 bits. A float instruction moves its operands into the float
 * registers FR0 and FR1, works there, and moves the result back. */
static void load_f(struct sljit_compiler *C, sljit_s32 fr, Opnd o)
{
	if (o.arg == SLJIT_IMM) {
		sljit_f64 d;
		memcpy(&d, &o.w, sizeof d);
		sljit_emit_fset64(C, fr, d);
	} else if (o.arg & SLJIT_MEM) {
		sljit_emit_fop1(C, SLJIT_MOV_F64, fr, 0, o.arg, o.w);
	} else {
		sljit_emit_fcopy(C, SLJIT_COPY_TO_F64, fr, o.arg);
	}
}

static void store_f(struct sljit_compiler *C, Opnd o, sljit_s32 fr)
{
	if (o.arg == SLJIT_IMM)
		die("a float instruction cannot write to an immediate");
	if (o.arg & SLJIT_MEM)
		sljit_emit_fop1(C, SLJIT_MOV_F64, o.arg, o.w, fr, 0);
	else
		sljit_emit_fcopy(C, SLJIT_COPY_FROM_F64, fr, o.arg);
}

static int float_instruction(struct sljit_compiler *C, const char *op, char **ops, int n)
{
	static const struct { const char *name; sljit_s32 op; } fop2s[] = {
		{ "fadd", SLJIT_ADD_F64 }, { "fsub", SLJIT_SUB_F64 }, { "fmul", SLJIT_MUL_F64 }, { "fdiv", SLJIT_DIV_F64 },
	};
	const Cond *cc;
	Opnd a, b;
	for (size_t i = 0; i < sizeof fop2s / sizeof fop2s[0]; i++)
		if (!strcmp(op, fop2s[i].name)) {
			need(n, 3, op);
			a = operand(ops[0]);
			load_f(C, SLJIT_FR0, operand(ops[1]));
			load_f(C, SLJIT_FR1, operand(ops[2]));
			sljit_emit_fop2(C, fop2s[i].op, SLJIT_FR0, 0, SLJIT_FR0, 0, SLJIT_FR1, 0);
			store_f(C, a, SLJIT_FR0);
			return 1;
		}
	if (!strcmp(op, "fneg")) {
		need(n, 2, op);
		a = operand(ops[0]);
		load_f(C, SLJIT_FR0, operand(ops[1]));
		sljit_emit_fop1(C, SLJIT_NEG_F64, SLJIT_FR0, 0, SLJIT_FR0, 0);
		store_f(C, a, SLJIT_FR0);
		return 1;
	}
	if (!strcmp(op, "i2f")) {            /* a 64-bit integer to the double nearest it */
		need(n, 2, op);
		a = operand(ops[0]);
		b = operand(ops[1]);
		sljit_emit_fop1(C, SLJIT_CONV_F64_FROM_SW, SLJIT_FR0, 0, b.arg, b.w);
		store_f(C, a, SLJIT_FR0);
		return 1;
	}
	if ((cc = fcond_of(op, "fset"))) {
		need(n, 3, op);
		a = operand(ops[0]);
		if (a.arg == SLJIT_IMM)
			die("%s cannot write to an immediate", op);
		load_f(C, SLJIT_FR0, operand(ops[1]));
		load_f(C, SLJIT_FR1, operand(ops[2]));
		sljit_emit_fop1(C, SLJIT_CMP_F64 | cc->flag, SLJIT_FR0, 0, SLJIT_FR1, 0);
		sljit_emit_op_flags(C, SLJIT_MOV, a.arg, a.w, cc->type);
		return 1;
	}
	if ((cc = fcond_of(op, "fb"))) {
		need(n, 3, op);
		load_f(C, SLJIT_FR0, operand(ops[0]));
		load_f(C, SLJIT_FR1, operand(ops[1]));
		jump_to(sljit_emit_fcmp(C, cc->type, SLJIT_FR0, 0, SLJIT_FR1, 0), ops[2]);
		return 1;
	}
	return 0;
}

#endif /* !CJI_RV32 */

/* ---- chapter 13: static strings and shapes ---------------------------------------------
 * strref d, "text" and shaperef d, ["a","b"] load the address of a static object, made
 * once per distinct text: the same shape is always the same address, so a dynamic check
 * of a record's shape compares two words. The text is JSON whose non-ASCII code units the
 * compiler wrote as \uXXXX. */

static struct { char *text; int64_t addr; } *interned;
static int ninterned, interned_cap;


/* Decodes the JSON string starting at p (at its quote) into units; returns the end. */
static char *json_string(char *p, uint16_t *u, int64_t *n)
{
	if (*p != '"')
		die("expected a JSON string");
	*n = 0;
	for (p++; *p != '"'; p++) {
		uint16_t c = (uint16_t)(unsigned char)*p;
		if (!*p)
			die("unterminated string");
		if (*p == '\\') {
			p++;
			switch (*p) {
			case 'n': c = '\n'; break;
			case 't': c = '\t'; break;
			case 'r': c = '\r'; break;
			case 'b': c = '\b'; break;
			case 'f': c = '\f'; break;
			case 'u': {
				char hex[5] = { p[1], p[2], p[3], p[4], 0 };
				c = (uint16_t)strtol(hex, NULL, 16);
				p += 4;
				break;
			}
			default: c = (uint16_t)(unsigned char)*p;
			}
		}
		u[(*n)++] = c;
	}
	return p + 1;
}

static int64_t intern(const char *key, int64_t addr)
{
	interned = grow(interned, &interned_cap, ninterned, sizeof *interned);
	interned[ninterned].text = malloc(strlen(key) + 1);
	if (!interned[ninterned].text)
		die("out of memory");
	strcpy(interned[ninterned].text, key);
	interned[ninterned].addr = addr;
	return interned[ninterned++].addr;
}
static int64_t lookup(const char *key)
{
	for (int i = 0; i < ninterned; i++)
		if (!strcmp(interned[i].text, key))
			return interned[i].addr;
	return 0;
}

static int64_t static_string(char *json)
{
	uint16_t *u;
	int64_t n, found;
	char key[1 << 16];
	json[strcspn(json, "\r\n")] = '\0';
	if (aot)   /* (chapter 26) */
		return aot_addr(aot_sym(SYM_STRING, json));
	snprintf(key, sizeof key, "s%s", json);
	if ((found = lookup(key)))
		return found;
	u = malloc((strlen(json) + 1) * sizeof *u);   /* (chapter 25: as long as the literal, while it is decoded) */
	if (!u)
		die("out of memory");
	json_string(json, u, &n);
	found = intern(key, rt_static_string(u, n));
	free(u);
	return found;
}

static int64_t static_shape(char *json)
{
	uint16_t *u = malloc((strlen(json) + 1) * sizeof *u);   /* (chapter 25: see static_string) */
	int64_t names[64], count = 0, n, found, *table;
	if (!u)
		die("out of memory");
	char key[1 << 16], *p;
	json[strcspn(json, "\r\n")] = '\0';
	if (aot) {   /* (chapter 26: a shape symbol; its names are string symbols) */
		int k = aot_sym(SYM_SHAPE, json);
		if (!aot_syms[k].parsed) {
			aot_syms[k].parsed = 1;
			p = skip(json);
			if (*p++ != '[')
				die("a shape is a JSON array of names");
			while (*(p = skip(p)) != ']') {
				char *end = json_string(p, u, &n), nk[1 << 12];
				int at;
				snprintf(nk, sizeof nk, "%.*s", (int)(end - p), p);
				at = aot_sym(SYM_STRING, nk);
				if (aot_syms[k].nnames == 64)
					die("a record with more than 64 fields");
				aot_syms[k].names[aot_syms[k].nnames++] = at;
				p = skip(end);
				if (*p == ',')
					p++;
			}
			p = skip(p + 1);
			aot_syms[k].error = *p == ',' && !strncmp(skip(p + 1), "error", 5);
		}
		free(u);
		return aot_addr(k);
	}
	snprintf(key, sizeof key, "h%s", json);
	if ((found = lookup(key))) {
		free(u);
		return found;
	}
	p = skip(json);
	if (*p++ != '[')
		die("a shape is a JSON array of names");
	while (*(p = skip(p)) != ']') {
		char *end;
		if (count == 64)
			die("a record with more than 64 fields");
		end = json_string(p, u, &n);
		{
			char nk[1 << 12];
			snprintf(nk, sizeof nk, "s%.*s", (int)(end - p), p);
			names[count++] = (found = lookup(nk)) ? found : intern(nk, rt_static_string(u, n));
		}
		p = skip(end);
		if (*p == ',')
			p++;
	}
	/* chapter 14: after the names, 1 for an Error's shape (written "[...], error"), else 0 */
	p = skip(p + 1);
	table = calloc((size_t)count + 2, 8);
	if (!table)
		die("out of memory");
	table[0] = count;
	for (int64_t k = 0; k < count; k++)
		table[k + 1] = names[k];
	table[count + 1] = *p == ',' && !strncmp(skip(p + 1), "error", 5);
	free(u);
	return intern(key, (int64_t)table);
}

int64_t error_shape(void)
{
	char text[] = "[\"message\",\"name\"], error";
	return static_shape(text);
}

static int field(const char *line, const char *key);
#ifdef CJI_RV32
#include "rv32.c"
#else
static void instruction(struct sljit_compiler *C, char *op, char *rest)
{
	char *ops[4];
	int n;
	Opnd a, b, c;
	const Cond *cc;
	sljit_s32 op2;

	ends_block = !strcmp(op, "return") || !strcmp(op, "jump") || !strcmp(op, "tailcall") || !strcmp(op, "tailcallr");
	if (!strcmp(op, "call") || !strcmp(op, "tailcall")) {
		char *name;
		int n = name_and_count(rest, &name);
		sljit_s32 type = SLJIT_CALL_REG_ARG | (op[0] == 't' ? SLJIT_CALL_RETURN : 0);
		if (n > 4)
			die("%s: at most 4 arguments", op);
		if (aot && is_extern('f', name)) {   /* chapter 28: in the shared unit, through its symbol */
			sljit_emit_icall(C, type, word_args(n, SLJIT_ARG_TYPE_W), SLJIT_IMM, aot_addr(aot_sym(SYM_FUNC, name)));
			return;
		}
		call_to(sljit_emit_call(C, type, word_args(n, SLJIT_ARG_TYPE_W)), name);
		return;
	}
	if (!strcmp(op, "callr") || !strcmp(op, "tailcallr")) {
		char *target;
		int n = name_and_count(rest, &target);
		Opnd f = operand(target);
		sljit_s32 type = SLJIT_CALL_REG_ARG | (op[0] == 't' ? SLJIT_CALL_RETURN : 0);
		if (n > 4)
			die("%s: at most 4 arguments", op);
		sljit_emit_icall(C, type, word_args(n, SLJIT_ARG_TYPE_W), f.arg, f.w);
		return;
	}
	if (!strcmp(op, "jump")) {
		rest = skip(rest);
		if (!*rest)
			die("jump needs a label");
		jump_to(sljit_emit_jump(C, SLJIT_JUMP), rest);
		return;
	}
	if (!strcmp(op, "icall")) {
		char *slash;
		rest = skip(rest);
		slash = strchr(rest, '/');
		if (!slash)
			die("icall needs NAME/NARGS");
		*slash = '\0';
		for (size_t i = 0; i < sizeof runtime / sizeof runtime[0]; i++)
			if (!strcmp(runtime[i].name, rest)) {
				if (atoi(slash + 1) != runtime[i].nargs)
					die("%s takes %d arguments", rest, runtime[i].nargs);
				sljit_emit_icall(C, SLJIT_CALL, arg_types(runtime[i].nargs, runtime[i].returns),
					SLJIT_IMM, aot ? aot_addr(aot_sym(SYM_RT, runtime[i].name)) : SLJIT_FUNC_ADDR(runtime[i].fn));
				return;
			}
		die("unknown runtime function '%s'", rest);
	}

	if (!strcmp(op, "strref") || !strcmp(op, "shaperef")) {   /* chapter 13 */
		char *comma = strchr(rest, ',');
		if (!comma)
			die("%s needs a destination and a value", op);
		*comma = '\0';
		ops[0] = skip(rest);
		ops[0][strcspn(ops[0], " \t")] = '\0';
		a = operand(ops[0]);
		if (a.arg == SLJIT_IMM)
			die("%s cannot write to an immediate", op);
		sljit_emit_op1(C, SLJIT_MOV, a.arg, a.w, SLJIT_IMM,
			(sljit_sw)(op[0] == 's' && op[1] == 't' ? static_string(skip(comma + 1)) : static_shape(skip(comma + 1))));
		return;
	}

	n = split(rest, ops, 4);
	if (float_instruction(C, op, ops, n))   /* chapter 10 */
		return;
	if (!strcmp(op, "mov")) {
		need(n, 2, op);
		a = operand(ops[0]);
		b = operand(ops[1]);
		if (a.arg == SLJIT_IMM)
			die("mov cannot write to an immediate");
		sljit_emit_op1(C, SLJIT_MOV, a.arg, a.w, b.arg, b.w);
	} else if ((op2 = op2_of(op))) {
		need(n, 3, op);
		a = operand(ops[0]);
		b = operand(ops[1]);
		c = operand(ops[2]);
		if (a.arg == SLJIT_IMM)
			die("%s cannot write to an immediate", op);
		sljit_emit_op2(C, op2, a.arg, a.w, b.arg, b.w, c.arg, c.w);
	} else if ((cc = cond_of(op, "set"))) {
		/* compare (a subtraction that only sets flags), then turn the flag into 0 or 1 */
		need(n, 3, op);
		a = operand(ops[0]);
		b = operand(ops[1]);
		c = operand(ops[2]);
		if (a.arg == SLJIT_IMM)
			die("%s cannot write to an immediate", op);
		sljit_emit_op2u(C, SLJIT_SUB | cc->flag, b.arg, b.w, c.arg, c.w);
		sljit_emit_op_flags(C, SLJIT_MOV, a.arg, a.w, cc->type);
	} else if ((cc = cond_of(op, "b"))) {
		need(n, 3, op);
		a = operand(ops[0]);
		b = operand(ops[1]);
		jump_to(sljit_emit_cmp(C, cc->type, a.arg, a.w, b.arg, b.w), ops[2]);
	} else if (!strcmp(op, "funref")) {
		need(n, 2, op);
		a = operand(ops[0]);
		if (a.arg == SLJIT_IMM)
			die("funref cannot write to an immediate");
		if (aot && is_extern('f', ops[1]))   /* chapter 28 */
			sljit_emit_op1(C, SLJIT_MOV, a.arg, a.w, SLJIT_IMM, aot_addr(aot_sym(SYM_FUNC, ops[1])));
		else
			call_to(sljit_emit_op_addr(C, SLJIT_MOV_ADDR, a.arg, a.w), ops[1]);
	} else if (!strcmp(op, "closure")) {
		need(n, 2, op);
		a = operand(ops[0]);
		if (a.arg == SLJIT_IMM)
			die("closure cannot write to an immediate");
		sljit_emit_op1(C, SLJIT_MOV, a.arg, a.w, SLJIT_IMM, (sljit_sw)static_closure(ops[1]));
	} else if (!strcmp(op, "lea")) {
		need(n, 2, op);
		a = operand(ops[0]);
		b = operand(ops[1]);
		if (b.arg != SLJIT_MEM1(SLJIT_SP))
			die("lea takes a frame operand [sp+k]");
		sljit_get_local_base(C, a.arg, a.w, b.w);
	} else if (!strcmp(op, "return")) {
		need(n, 1, op);
		a = operand(ops[0]);
		sljit_emit_return(C, SLJIT_MOV, a.arg, a.w);
	} else {
		die("unknown instruction '%s'", op);
	}
}

#endif /* !CJI_RV32: instruction */

/* ---- functions and the driver ---------------------------------------------------------- */

static int field(const char *line, const char *key)
{
	const char *p = strstr(line, key);
	if (!p)
		die("function header needs %s", key);
	return atoi(p + strlen(key));
}

#ifndef CJI_RV32
static void header(struct sljit_compiler *C, char *line, Fn *fn)
{
	char *p = skip(line + strlen("function"));
	char *slash = strchr(p, '/');
	size_t len;
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
	fn->entry = sljit_emit_label(C);
	/* (chapter 24: and an entry of a native world, $nw..., which C calls between events) */
	if (!strcmp(fn->name, "main") || !strncmp(fn->name, "$nw", 3)) {
		if (fn->nparams != 0 && !strcmp(fn->name, "main"))
			die("main takes no arguments");
		/* (chapter 24: an entry takes its closure as its one C argument, in S0, and passes it on in
		   R0, where every compiled function finds its closure) */
		int entry = strncmp(fn->name, "main", 5) != 0;
		sljit_emit_enter(C, 0, arg_types(entry ? 1 : 0, 1), fn->scratches | SLJIT_ENTER_FLOAT(2), fn->saveds, fn->local);
		if (entry)
			sljit_emit_op1(C, SLJIT_MOV, SLJIT_R0, 0, SLJIT_S0, 0);
	} else {
		/* every function may use FR0 and FR1, the two float scratch registers that the
		   floating-point instructions (chapter 10) work in */
		sljit_emit_enter(C, SLJIT_ENTER_REG_ARG, word_args(fn->nparams, SLJIT_ARG_TYPE_W_R),
			fn->scratches | SLJIT_ENTER_FLOAT(2), fn->saveds, fn->local);
	}
}
#endif /* !CJI_RV32 */

/* Chapter 24: slas as a library, for a native world, whose binary holds its SLIR text:
 * slas_load assembles a program, slas_function finds one of its functions by name (a name
 * the compiler numbered, $nwEvent.12, is found as $nwEvent). */
static Fn *fns;
static int nfns, fns_cap;
static sljit_uw code_size;
static struct sljit_compiler *C;
static void *code;
/* Chapter 31: a native primitive. A function named $nat_NAME is the subset's reference definition
 * of the runtime function rt_NAME: its body is skipped, and in its place the function passes its
 * arguments (r1.., after the closure) to rt_NAME and returns what it returns. (CJI-3: and the root
 * stack's top after them, when rt_NAME allocates: see native_roots.) */
static void native_body(struct sljit_compiler *C, Fn *fn)
{
	char op[16], args[128];
	int n = fn->nparams - 1, roots = native_roots(fn->name, fn->nparams);
	int len = (int)strcspn(fn->name + 5, ".");
	for (int i = 0; i < n; i++) {
		strcpy(op, "mov");
		snprintf(args, sizeof args, "r%d, r%d", i, i + 1);
		instruction(C, op, args);
	}
	if (roots) {   /* (CJI-3: an allocating native gets the root stack's top last) */
		strcpy(op, "mov");
		snprintf(args, sizeof args, "r%d, s0", n);
		instruction(C, op, args);
	}
	strcpy(op, "icall");
	snprintf(args, sizeof args, "%.*s/%d", len, fn->name + 5, n + roots);
	instruction(C, op, args);
	strcpy(op, "return");
	strcpy(args, "r0");
	instruction(C, op, args);
}

int slas_load(FILE *f, int verbose, const char *code_out)
{
	char *line = malloc(1 << 17);   /* chapter 13: a string literal may make a long line */
	enum { LINE = 1 << 17 };
	int in_fn = 0, native = 0;
	if (!line)
		die("out of memory");
	C = sljit_create_compiler(NULL);
#if (defined SLJIT_VERBOSE && SLJIT_VERBOSE)
	if (verbose)
		sljit_compiler_verbose(C, stderr);
#else
	(void)verbose;
#endif
	while (fgets(line, LINE, f)) {
		char *p, *semi, *op;
		src_line++;
		/* a comment starts at a ; outside a string (chapter 13) */
		for (semi = line; *semi; semi++) {
			if (*semi == '"')
				for (semi++; *semi && *semi != '"'; semi++)
					if (*semi == '\\' && semi[1])
						semi++;
			if (*semi == ';') {
				*semi = '\0';
				break;
			}
			if (!*semi)
				break;
		}
		p = skip(line);
		p[strcspn(p, "\r\n")] = '\0';
		if (!*p)
			continue;
		if (!strncmp(p, "function ", 9)) {
			if (in_fn)
				die("function inside a function");
			fns = grow(fns, &fns_cap, nfns, sizeof *fns);
			cur = &fns[nfns++];
			header(C, p, cur);
			in_fn = 1;
			if ((native = !strncmp(cur->name, "$nat_", 5)))   /* chapter 31 */
				native_body(C, cur);
			continue;
		}
		if (!in_fn)
			die("instruction outside a function");
		if (native && strcmp(p, "end"))   /* (the reference definition's body) */
			continue;
		if (!strcmp(p, "end")) {
			if (!ends_block)
				die("%s falls off its end: the last block needs return or jump", cur->name);
			resolve_jumps();
			in_fn = 0;
			continue;
		}
		if (p[strlen(p) - 1] == ':') {   /* a label; a block before it may fall through */
			p[strlen(p) - 1] = '\0';
			define_label(C, p);
			ends_block = 0;
			continue;
		}
		op = p;
		p += strcspn(p, " \t");
		if (*p)
			*p++ = '\0';
		instruction(C, op, p);
	}
	if (in_fn)
		die("missing 'end'");
	for (int i = 0; i < ncalls; i++) {
		int k = 0;
		while (k < nfns && strcmp(fns[k].name, calls[i].name))
			k++;
		if (k == nfns) {
			src_line = calls[i].line;
			die("call to undefined function %s", calls[i].name);
		}
		sljit_set_label(calls[i].jump, fns[k].entry);
	}

	code = sljit_generate_code(C, 0, NULL);
	if (!code) {
		fprintf(stderr, "slas: SLJIT error %d\n", (int)sljit_get_compiler_error(C));
		return 2;
	}
	code_size = sljit_get_generated_code_size(C);
	for (int i = 0; i < nfns; i++)   /* (chapter 26: before the compiler, and its labels, go) */
		fns[i].addr = sljit_get_label_addr(fns[i].entry);
#ifdef CJI_RV32
	rv32_generated();
#endif
	for (int i = 0; i < nstatics; i++) {   /* the static closures' code addresses */
		int k = 0;
		while (k < nfns && strcmp(fns[k].name, statics[i].name))
			k++;
		if (k == nfns) {
			fprintf(stderr, "slas: closure of undefined function %s\n", statics[i].name);
			return 2;
		}
		statics[i].obj[1] = (int64_t)fns[k].addr;
		statics[i].obj[0] += (int64_t)(fns[k].nparams - 1) << 46;   /* chapter 9: the arity */
	}
	if (code_out) {
		FILE *o = fopen(code_out, "wb");
		if (!o || fwrite(code, 1, sljit_get_generated_code_size(C), o) != sljit_get_generated_code_size(C)) {
			perror(code_out);
			return 2;
		}
		fclose(o);
	}
	/* (chapter 25: the assembler's memory is not needed once there is code: a world keeps
	   only its code, its functions' addresses and its static closures) */
	sljit_free_compiler(C);
	C = NULL;
	free(labels); free(pending); free(calls); free(line);
	/* (the interned strings and shapes stay: a shape is always the same address, also for the
	   runtime's error_shape after loading) */
	labels = NULL; pending = NULL; calls = NULL;
	labels_cap = pending_cap = calls_cap = 0;
	nlabels = npending = ncalls = 0;
	if (!keep_statics)
		free_statics();
	return 0;
}
void *slas_function(const char *name)
{
	size_t n = strlen(name);
	for (int i = 0; i < nfns; i++)   /* the name itself (main), else a numbered one ($nwEvent.54) */
		if (!strcmp(fns[i].name, name))
			return (void *)fns[i].addr;
	for (int i = 0; i < nfns; i++)
		if (!strncmp(fns[i].name, name, n) && fns[i].name[n] == '.')
			return (void *)fns[i].addr;
	return NULL;
}


/* ---- Chapter 26: ahead of time, the object ---------------------------------------------
 * slas_aot assembles the program twice, with the stand-in addresses of aot_addr at two
 * bases, and compares the two codes. A 64-bit field that differs by the bases' distance is
 * the address of symbol i (plus an addend); one that differs by the two codes' distance is an
 * absolute address in the code itself. Everything else must be equal: calls between the
 * program's functions are relative. Then it writes an ELF64 relocatable object (x86-64): .text
 * is the code with every address field zero, .data holds the static strings, shapes and
 * closures, and each field is an R_X86_64_64 relocation, against an undefined symbol (rt_*, a
 * runtime global) or a section. It exports cji_main, cji_nwNAME for each $nwNAME entry, and
 * cji_error_shape, the Error shape the runtime's error_shape returns. */
#include <elf.h>
typedef struct { unsigned char *d; size_t n, cap; } Out;
static void out_put(Out *o, const void *p, size_t n)
{
	if (o->n + n > o->cap) {
		while (o->n + n > o->cap)
			o->cap = o->cap ? 2 * o->cap : 4096;
		o->d = realloc(o->d, o->cap);
		if (!o->d)
			die("out of memory");
	}
	memcpy(o->d + o->n, p, n);
	o->n += n;
}
static void out_align(Out *o, size_t a) { static const unsigned char z[16]; while (o->n % a) out_put(o, z, 1); }
static Elf64_Word out_str(Out *o, const char *s) { Elf64_Word at = (Elf64_Word)o->n; out_put(o, s, strlen(s) + 1); return at; }
typedef struct { size_t offset; int sym; int64_t addend; } Reloc;   /* sym < 0: the code itself */

/* the program, assembled once as a pass of AOT: its code (kept), size and functions */
static int aot_pass(const char *text, size_t len, int pass, unsigned char **code_at, sljit_uw *size)
{
	FILE *f = fmemopen((void *)text, len, "r");
	if (!f)
		die("fmemopen failed");
	aot = pass;
	nfns = 0;
	if (slas_load(f, 0, NULL))
		return 2;
	fclose(f);
	*code_at = code;
	*size = code_size;
	return 0;
}

/* ---- Chapter 27: the heap after main, taken at build time --------------------------------
 * A world's main makes no system call: it builds the runtime's objects and the world's
 * definition and hands over two entries. So slas -c can run it here, once, with the JIT, and
 * ship what it built: rt_snapshot copies what the entries reach into a block, and every
 * pointer that leaves the heap gets a name the object file can use (a string, a shape, a
 * static closure, or a function's code). Then only the functions the block can reach are
 * assembled: main and everything only main used are gone. A main that printed, stopped with
 * an exception or reached a system call (a TypeError: there is no kernel here) gets no snapshot,
 * and the world runs main when it starts, as before. */
#include <unistd.h>
#include <setjmp.h>
#include <sys/stat.h>
typedef struct { int64_t at; int kind; char *text; int sym; } SnapRef;   /* kind: SYM_*, or -1: code */
static int64_t *snap_image, snap_words = -1, snap_entries[2], snap_bad;
static uint64_t *snap_map;
static SnapRef *snap_refs;
static int nsnap_refs, snap_refs_cap, snapshots = 1;
static const char *pruned_out;   /* -p: the text slas -c assembles, after the snapshot (chapter 28) */

static int snap_ref(int64_t at, int kind, const char *text)
{
	snap_refs = grow(snap_refs, &snap_refs_cap, nsnap_refs, sizeof *snap_refs);
	snap_refs[nsnap_refs].at = at;
	snap_refs[nsnap_refs].kind = kind;
	snap_refs[nsnap_refs].sym = -1;
	if (!(snap_refs[nsnap_refs].text = malloc(strlen(text) + 1)))
		die("out of memory");
	strcpy(snap_refs[nsnap_refs++].text, text);
	return 0;
}

/* rt_snapshot's question: what is v, at word `at` of the block? */
static int snap_outside(int64_t at, int64_t v, int role)
{
	if (role == 2) {   /* word 1 of a closure: its code (or not a closure: a plain word) */
		for (int i = 0; i < nfns; i++)
			if ((int64_t)fns[i].addr == v)
				return snap_ref(at, -1, fns[i].name);
		if ((sljit_uw)v >= (sljit_uw)code && (sljit_uw)v < (sljit_uw)code + code_size)
			return snap_bad = v, -1;   /* into a function, not its start */
		return 0;
	}
	for (int i = 0; i < ninterned; i++)
		if (interned[i].addr == v) {
			if (role == 1 && interned[i].text[0] != 'h')
				break;
			return snap_ref(at, interned[i].text[0] == 's' ? SYM_STRING : SYM_SHAPE, interned[i].text + 1);
		}
	if (role == 0)
		for (int i = 0; i < nstatics; i++)
			if ((int64_t)statics[i].obj == v)
				return snap_ref(at, SYM_CLOSURE, statics[i].name);
	snap_bad = v;
	return -1;
}

static jmp_buf snap_escape;
static const char *snap_fatal;
static void snap_fatal_error(const char *msg) { snap_fatal = msg; longjmp(snap_escape, 1); }

static int take_snapshot(const char *text, size_t len)
{
	FILE *f = fmemopen((void *)text, len, "r"), *trap;
	sljit_sw (SLJIT_FUNC *entry)(void);
	sljit_sw status;
	int out, err;
	struct stat st;
	if (!f)
		die("fmemopen failed");
	aot = 0;
	nfns = 0;
	keep_statics = 1;   /* (snap_outside names a static closure by them; until CJI-3 a snapshot whose heap
	                       held one was refused, which no whole world's did) */
	if (slas_load(f, 0, NULL))
		return keep_statics = 0, free_statics(), -1;
	keep_statics = 0;
	fclose(f);
	if (!(entry = (sljit_sw (SLJIT_FUNC *)(void))slas_function("main")))
		return free_statics(), -1;
	rt_initialize(1 << 20, 1 << 16);
	/* what main writes goes to a file: a main that writes anything keeps running at start */
	fflush(stdout);
	fflush(stderr);
	if (!(trap = tmpfile()) || (out = dup(1)) < 0 || (err = dup(2)) < 0)
		die("cannot catch main's output");
	dup2(fileno(trap), 1);
	dup2(fileno(trap), 2);
	rt_fatal = snap_fatal_error;   /* a fatal error (a system call: there is no kernel here) comes back here */
	if (setjmp(snap_escape))
		status = -1;
	else
		status = entry();
	rt_fatal = NULL;
	fflush(stdout);
	fflush(stderr);
	dup2(out, 1);
	dup2(err, 2);
	close(out);
	close(err);
	fstat(fileno(trap), &st);
	fclose(trap);
	if (status != 0 || exc_flag || st.st_size > 0) {
		if (snap_fatal)
			fprintf(stderr, "slas: no snapshot: main stopped: %s\n", snap_fatal);
		else
			fprintf(stderr, "slas: no snapshot: main %s\n", st.st_size > 0 ? "wrote output" : "stopped with an exception");
		return free_statics(), -1;
	}
	snap_words = rt_snapshot(&snap_image, &snap_map, snap_entries, snap_outside);
	free_statics();
	if (snap_words < 0) {
		fprintf(stderr, "slas: no snapshot: the heap holds %#llx, which has no name\n", (unsigned long long)snap_bad);
		return -1;
	}
	return 0;
}

/* The functions the snapshot can reach, and every function they name, in the text's order. */
typedef struct { const char *name, *start, *end; size_t nlen; int keep; } TextFn;
static int text_fn(TextFn *t, int n, const char *name, size_t nlen)
{
	for (int i = 0; i < n; i++)
		if (t[i].nlen == nlen && !strncmp(t[i].name, name, nlen))
			return i;
	return -1;
}
/* (CJI-3: the arity of each shared function the text names, for a static closure of one that the
   shared unit does not make: a world compiled against the world runtime's unit holds such closures
   in its snapshot, the runtime's exports) */
static struct { char name[64]; int nparams; } *ext_fns;
static int next_fns, ext_fns_cap;
static int ext_arity(const char *name)
{
	for (int i = 0; i < next_fns; i++)
		if (!strcmp(ext_fns[i].name, name))
			return ext_fns[i].nparams;
	return -1;
}

static char *prune_text(const char *text, size_t *len, int prune)
{
	TextFn *t = NULL;
	int n = 0, cap = 0, *work, nwork = 0;
	const char *p = text, *e = text + *len;
	char *out, *o;
	while (p < e) {
		const char *nl = memchr(p, '\n', (size_t)(e - p)), *next = nl ? nl + 1 : e;
		if (!strncmp(p, "function ", 9)) {
			t = grow(t, &cap, n, sizeof *t);
			t[n].name = p + 9;
			t[n].nlen = strcspn(p + 9, "/ \n");
			t[n].start = p;
			t[n].keep = 0;
		} else if (!strncmp(p, "end", 3) && (p + 3 == e || p[3] == '\n' || p[3] == '\r'))
			t[n++].end = next;
		p = next;
	}
	if (!(work = malloc(sizeof *work * (size_t)(n + nsnap_refs + 1))))
		die("out of memory");
	/* (chapter 28: a function the shared unit has is never kept, nor followed) */
	for (int i = 0; i < n; i++) {
		char name[256];
		snprintf(name, sizeof name, "%.*s", (int)t[i].nlen, t[i].name);
		t[i].keep = is_extern('f', name) ? -1 : prune ? 0 : 1;
		if (t[i].keep == -1 && strlen(name) < sizeof ext_fns[0].name && t[i].name[t[i].nlen] == '/') {
			ext_fns = grow(ext_fns, &ext_fns_cap, next_fns, sizeof *ext_fns);
			strcpy(ext_fns[next_fns].name, name);
			ext_fns[next_fns++].nparams = atoi(t[i].name + t[i].nlen + 1);
		}
	}
	for (int r = 0; prune && r < nsnap_refs; r++)
		if (snap_refs[r].kind == -1 || snap_refs[r].kind == SYM_CLOSURE) {
			int k = text_fn(t, n, snap_refs[r].text, strlen(snap_refs[r].text));
			if (k < 0)
				die("snapshot: no function %s", snap_refs[r].text);
			if (!t[k].keep)
				t[k].keep = 1, work[nwork++] = k;
		}
	while (nwork) {
		int k = work[--nwork];
		for (p = t[k].start; p < t[k].end; ) {
			const char *nl = memchr(p, '\n', (size_t)(t[k].end - p)), *next = nl ? nl + 1 : t[k].end, *q = p, *name = NULL;
			size_t nlen = 0;
			while (q < next && *q == ' ')
				q++;
			if (!strncmp(q, "call ", 5) || !strncmp(q, "tailcall ", 9)) {
				name = q + strcspn(q, " ");
				name += strspn(name, " ");
				nlen = strcspn(name, "/ \n");
			} else if (!strncmp(q, "funref ", 7) || !strncmp(q, "closure ", 8)) {
				name = q + strcspn(q, ",");
				name += strspn(name, ", ");
				nlen = strcspn(name, " \r\n");
			}
			if (name) {
				int c = text_fn(t, n, name, nlen);
				if (c >= 0 && !t[c].keep)
					t[c].keep = 1, work[nwork++] = c;
			}
			p = next;
		}
	}
	if (!(o = out = malloc(*len + 1)))
		die("out of memory");
	for (int i = 0; i < n; i++)
		if (t[i].keep == 1) {
			memcpy(o, t[i].start, (size_t)(t[i].end - t[i].start));
			o += t[i].end - t[i].start;
		}
	*o = '\0';
	*len = (size_t)(o - out);
	free(t);
	free(work);
	return out;
}

/* CJI-4 (chapter 30): the snapshot as text. slas-rv32 cannot run the code it makes, but a snapshot does
 * not depend on the machine: the heap is the same 64-bit words on both (chapter 29), and every word
 * that leaves the block is named. So the host's slas takes it (--snapshot-out FILE) and slas-rv32
 * lays it out (--snapshot FILE). The file:
 *
 *   cji-snapshot 1
 *   none WHY                                      (when there is none)
 *   words N entries E0 E1 refs R
 *   N lines: the block's words in hex (a named word is written as 0)
 *   (N + 63) / 64 + 1 lines: the map, in hex
 *   R lines: ref AT KIND TEXT                     (KIND: code, string, shape or closure; TEXT is the
 *                                                  rest of the line: a function's name or a literal's
 *                                                  SLIR text) */
static const char *const snap_kinds[] = { "code", "string", "shape", "closure" };
static int snap_kind_index(int kind) { return kind == -1 ? 0 : kind == SYM_STRING ? 1 : kind == SYM_SHAPE ? 2 : 3; }
static int write_snapshot(const char *path, const char *why)
{
	FILE *o = fopen(path, "w");
	if (!o) {
		perror(path);
		return 2;
	}
	fprintf(o, "cji-snapshot 1\n");
	if (snap_words <= 0)
		fprintf(o, "none %s\n", why);
	else {
		fprintf(o, "words %lld entries %lld %lld refs %d\n", (long long)snap_words, (long long)snap_entries[0],
			(long long)snap_entries[1], nsnap_refs);
		for (int r = 0; r < nsnap_refs; r++)
			snap_image[snap_refs[r].at] = 0;   /* (a host address: it is named instead) */
		for (int64_t i = 0; i < snap_words; i++)
			fprintf(o, "%016llx\n", (unsigned long long)snap_image[i]);
		for (int64_t i = 0; i < (snap_words + 63) / 64 + 1; i++)
			fprintf(o, "%016llx\n", (unsigned long long)snap_map[i]);
		for (int r = 0; r < nsnap_refs; r++)
			fprintf(o, "ref %lld %s %s\n", (long long)snap_refs[r].at, snap_kinds[snap_kind_index(snap_refs[r].kind)], snap_refs[r].text);
	}
	if (fclose(o)) {
		perror(path);
		return 2;
	}
	return 0;
}
static void read_snapshot(const char *path)
{
	FILE *f = fopen(path, "r");
	char line[1 << 16];
	long long words, e0, e1;
	int refs;
	if (!f || !fgets(line, sizeof line, f) || strcmp(line, "cji-snapshot 1\n"))
		die("%s: not a snapshot (slas --snapshot-out writes one)", path);
	if (!fgets(line, sizeof line, f))
		die("%s: cut short", path);
	if (!strncmp(line, "none ", 5)) {
		fclose(f);
		return;   /* (snap_words stays -1: main runs when the world starts) */
	}
	if (sscanf(line, "words %lld entries %lld %lld refs %d", &words, &e0, &e1, &refs) != 4 || words <= 0)
		die("%s: a bad header", path);
	snap_words = words, snap_entries[0] = e0, snap_entries[1] = e1;
	if (!(snap_image = malloc((size_t)words * 8)) || !(snap_map = malloc((size_t)((words + 63) / 64 + 1) * 8)))
		die("out of memory");
	for (long long i = 0; i < words + (words + 63) / 64 + 1; i++) {
		unsigned long long w;
		if (!fgets(line, sizeof line, f) || sscanf(line, "%llx", &w) != 1)
			die("%s: cut short", path);
		if (i < words)
			snap_image[i] = (int64_t)w;
		else
			snap_map[i - words] = (uint64_t)w;
	}
	for (int r = 0; r < refs; r++) {
		long long at;
		char kind[16];
		int n = 0, k;
		if (!fgets(line, sizeof line, f) || sscanf(line, "ref %lld %15s %n", &at, kind, &n) != 2 || !n || at < 0 || at >= words)
			die("%s: a bad reference", path);
		line[strcspn(line, "\n")] = '\0';
		for (k = 0; k < 4 && strcmp(kind, snap_kinds[k]); k++)
			;
		if (k == 4)
			die("%s: a reference of kind %s", path, kind);
		snap_ref((int64_t)at, k == 0 ? -1 : k == 1 ? SYM_STRING : k == 2 ? SYM_SHAPE : SYM_CLOSURE, line + n);
	}
	fclose(f);
}

int slas_aot(const char *text, size_t len, const char *out_path)
{
	unsigned char *a, *b;
	sljit_uw na, nb;
	Reloc *relocs = NULL, *drelocs = NULL;
	int nrelocs = 0, relocs_cap = 0, ndrelocs = 0, drelocs_cap = 0;
	int64_t *data_at;
	Out data = { 0 }, symtab = { 0 }, strtab = { 0 }, shstr = { 0 }, file = { 0 }, rela = { 0 }, drela = { 0 };
	int error_shape_sym;
	Fn *fa;
	int nfa, nlocals = 3;   /* (the symbols before the first global one) */
	/* chapter 27: a world's heap after main, and only the functions it reaches */
	if (!lib_mode && snapshots && strstr(text, "function $nwInit") && take_snapshot(text, len) == 0)
		text = prune_text(text, &len, 1);
	else if (next_keys)   /* chapter 28: without the shared unit's functions */
		text = prune_text(text, &len, 0);
	if (pruned_out) {
		FILE *o = fopen(pruned_out, "w");
		if (!o || fwrite(text, 1, len, o) != len) {
			perror(pruned_out);
			return 2;
		}
		fclose(o);
	}
	/* the Error shape exists in every program: the runtime's error_shape returns it */
	aot = 1;
	{
		char es[] = "[\"message\",\"name\"], error";
		static_shape(es);
		error_shape_sym = aot_sym(SYM_SHAPE, "[\"message\",\"name\"], error");
	}
	if (aot_pass(text, len, 1, &a, &na))
		return 2;
	fa = malloc((size_t)nfns * sizeof *fa);
	if (!fa)
		die("out of memory");
	memcpy(fa, fns, (size_t)nfns * sizeof *fa);
	nfa = nfns;
	if (aot_pass(text, len, 2, &b, &nb))
		return 2;
	if (na != nb)
		die("aot: the two passes made %lu and %lu bytes of code", (unsigned long)na, (unsigned long)nb);
	/* the differences: every 64-bit address field */
	for (size_t p = 0; p < na; p++) {
		int found = 0;
		if (a[p] == b[p])
			continue;
		for (size_t k = 0; k < 8 && !found; k++) {
			int64_t va, vb, ca = (int64_t)(sljit_uw)a, cb = (int64_t)(sljit_uw)b;
			size_t q;
			if (p < k || p - k + 8 > na)
				continue;
			q = p - k;
			memcpy(&va, a + q, 8);
			memcpy(&vb, b + q, 8);
			relocs = grow(relocs, &relocs_cap, nrelocs, sizeof *relocs);
			if (vb - va == AOT_BASE_B - AOT_BASE_A && va >= AOT_BASE_A && va < AOT_BASE_A + naot_syms * AOT_STRIDE) {
				relocs[nrelocs].offset = q;
				relocs[nrelocs].sym = (int)((va - AOT_BASE_A) / AOT_STRIDE);
				relocs[nrelocs++].addend = (va - AOT_BASE_A) % AOT_STRIDE;
				found = 1;
			} else if (va - ca == vb - cb && va - ca >= 0 && va - ca <= (int64_t)na) {
				relocs[nrelocs].offset = q;
				relocs[nrelocs].sym = -1;
				relocs[nrelocs++].addend = va - ca;
				found = 1;
			}
			if (found) {
				memset(a + q, 0, 8);
				p = q + 7;
			}
		}
		if (!found)
			die("aot: the code differs at %lu, and not by an address", (unsigned long)p);
	}
	/* chapter 27: the snapshot's names become symbols (a shape's names are parsed as the code's are) */
	for (int r = 0; r < nsnap_refs; r++) {
		SnapRef *x = &snap_refs[r];
		if (x->kind == SYM_SHAPE) {
			char *t = malloc(strlen(x->text) + 1);
			if (!t)
				die("out of memory");
			strcpy(t, x->text);
			static_shape(t);
			free(t);
		}
		if (x->kind >= 0)
			x->sym = aot_sym(x->kind, x->text);
	}
	/* (CJI-3: a static closure of a shared function made here points at the shared unit's symbol) */
	for (int i = 0, n0 = naot_syms; i < n0; i++)
		if (aot_syms[i].kind == SYM_CLOSURE && !aot_syms[i].ext && ext_arity(aot_syms[i].text) >= 0) {
			char *name = aot_syms[i].text;
			aot_sym(SYM_FUNC, name);
		}
	/* .data: each symbol's object, at data_at[i] (strings first: shapes point to them) */
	data_at = calloc((size_t)naot_syms, sizeof *data_at);
	if (!data_at)
		die("out of memory");
	for (int pass = 0; pass < 3; pass++)
		for (int i = 0; i < naot_syms; i++) {
			AotSym *y = &aot_syms[i];
			if (y->ext)   /* chapter 28: the shared unit's */
				continue;
			if (pass == 0 && y->kind == SYM_STRING) {
				uint16_t *u = malloc((strlen(y->text) + 1) * sizeof *u);
				int64_t n, *obj, words;
				char *t = malloc(strlen(y->text) + 1);
				if (!u || !t)
					die("out of memory");
				strcpy(t, y->text);
				json_string(t, u, &n);
				obj = (int64_t *)rt_static_string(u, n);
				words = obj[0] >> 3;
				out_align(&data, 8);
				data_at[i] = (int64_t)data.n;
				out_put(&data, obj, (size_t)(words + 1) * 8);
				free(u); free(t); free(obj);
			} else if (pass == 1 && y->kind == SYM_SHAPE) {
				int64_t w = y->nnames;
				out_align(&data, 8);
				data_at[i] = (int64_t)data.n;
				out_put(&data, &w, 8);
				for (int k = 0; k < y->nnames; k++) {
					int64_t zero = 0;
					drelocs = grow(drelocs, &drelocs_cap, ndrelocs, sizeof *drelocs);
					drelocs[ndrelocs].offset = data.n;
					if (aot_syms[y->names[k]].ext) {   /* (chapter 28: a name the shared unit has) */
						drelocs[ndrelocs].sym = y->names[k];
						drelocs[ndrelocs++].addend = 0;
					} else {
						drelocs[ndrelocs].sym = -2;   /* .data */
						drelocs[ndrelocs++].addend = data_at[y->names[k]];
					}
					out_put(&data, &zero, 8);
				}
				w = y->error == 1;
				out_put(&data, &w, 8);
			} else if (pass == 2 && y->kind == SYM_CLOSURE) {
				int k = 0;
				int64_t head, zero = 0;
				while (k < nfa && strcmp(fa[k].name, y->text))
					k++;
				if (k == nfa && ext_arity(y->text) >= 0) {
					/* (CJI-3: the shared unit has the function but makes no static closure of it, so
					   this world makes its own, the only one it holds, pointing at the unit's code) */
					head = 1 * 8 + 2 * 2 + 1 + ((int64_t)(ext_arity(y->text) - 1) << 46);
					out_align(&data, 8);
					data_at[i] = (int64_t)data.n;
					out_put(&data, &head, 8);
					drelocs = grow(drelocs, &drelocs_cap, ndrelocs, sizeof *drelocs);
					drelocs[ndrelocs].offset = data.n;
					drelocs[ndrelocs].sym = aot_sym(SYM_FUNC, y->text);
					drelocs[ndrelocs++].addend = 0;
					out_put(&data, &zero, 8);
					continue;
				}
				if (k == nfa)
					die(is_extern('f', y->text) ? "aot: a static closure of the shared function %s: the shared unit must make it"
						: "aot: closure of undefined function %s", y->text);
				head = 1 * 8 + 2 * 2 + 1 + ((int64_t)(fa[k].nparams - 1) << 46);
				out_align(&data, 8);
				data_at[i] = (int64_t)data.n;
				out_put(&data, &head, 8);
				drelocs = grow(drelocs, &drelocs_cap, ndrelocs, sizeof *drelocs);
				drelocs[ndrelocs].offset = data.n;
				drelocs[ndrelocs].sym = -1;   /* .text */
				drelocs[ndrelocs++].addend = (int64_t)(fa[k].addr - (sljit_uw)a);
				out_put(&data, &zero, 8);
			}
		}
	/* chapter 27: the snapshot, exported as cji_snapshot: [words, entry 0, entry 1, the block, its
	   map]; [0, 0, 0] when there is none. Its names are relocations, its pointers into itself offsets. */
	int64_t snap_at;
	out_align(&data, 8);
	snap_at = (int64_t)data.n;
	{
		int64_t head[3] = { snap_words > 0 ? snap_words : 0, snap_entries[0], snap_entries[1] }, base;
		out_put(&data, head, sizeof head);
		if (snap_words > 0) {
			base = (int64_t)data.n;
			for (int r = 0; r < nsnap_refs; r++) {
				SnapRef *x = &snap_refs[r];
				drelocs = grow(drelocs, &drelocs_cap, ndrelocs, sizeof *drelocs);
				drelocs[ndrelocs].offset = (size_t)(base + x->at * 8);
				if (x->kind == -1 && is_extern('f', x->text)) {   /* (chapter 28: the shared unit's code) */
					drelocs[ndrelocs].sym = aot_sym(SYM_FUNC, x->text);
					drelocs[ndrelocs++].addend = 0;
				} else if (x->kind == -1) {
					int k = 0;
					while (k < nfa && strcmp(fa[k].name, x->text))
						k++;
					if (k == nfa)
						die("snapshot: no function %s", x->text);
					drelocs[ndrelocs].sym = -1;   /* .text */
					drelocs[ndrelocs++].addend = (int64_t)(fa[k].addr - (sljit_uw)a);
				} else if (aot_syms[x->sym].ext) {
					drelocs[ndrelocs].sym = x->sym;
					drelocs[ndrelocs++].addend = 0;
				} else {
					drelocs[ndrelocs].sym = -2;   /* .data */
					drelocs[ndrelocs++].addend = data_at[x->sym];
				}
				snap_image[x->at] = 0;
			}
			out_put(&data, snap_image, (size_t)snap_words * 8);
			out_put(&data, snap_map, (size_t)((snap_words + 63) / 64 + 1) * 8);
		}
	}
	/* .symtab: null, the .text and .data sections, then the global symbols */
	{
		Elf64_Sym z = { 0 }, sec = { 0 };
		int *elf_sym = calloc((size_t)naot_syms, sizeof *elf_sym), nsyms = 3;
		nlocals = 3;
		if (!elf_sym)
			die("out of memory");
		out_str(&strtab, "");
		out_put(&symtab, &z, sizeof z);
		sec.st_info = ELF64_ST_INFO(STB_LOCAL, STT_SECTION);
		sec.st_shndx = 1;
		out_put(&symtab, &sec, sizeof sec);
		sec.st_shndx = 2;
		out_put(&symtab, &sec, sizeof sec);
		/* (CJI-3, lane 6: with SLAS_SYMBOLS set in the environment, every function as a local symbol
		   of .text, its size up to the next function, so that a profiler or gdb can name the code of
		   a program compiled ahead of time; the code and the other symbols are the same) */
		if (getenv("SLAS_SYMBOLS") && !lib_mode)
			for (int k = 0; k < nfa; k++) {
				Elf64_Sym e = { 0 };
				sljit_uw end = na + (sljit_uw)a;
				for (int j = 0; j < nfa; j++)   /* (the nearest function after this one) */
					if (fa[j].addr > fa[k].addr && fa[j].addr < end)
						end = fa[j].addr;
				e.st_name = out_str(&strtab, fa[k].name);
				e.st_info = ELF64_ST_INFO(STB_LOCAL, STT_FUNC);
				e.st_shndx = 1;
				e.st_value = fa[k].addr - (sljit_uw)a;
				e.st_size = end - fa[k].addr;
				out_put(&symtab, &e, sizeof e);
				nsyms++;
			}
		nlocals = nsyms;
		/* exports: main and the $nw entries in .text, the Error shape in .data (chapter 28: and in
		   a shared unit, every function and literal) */
		for (int k = 0; k < nfa; k++) {
			char name[80];
			Elf64_Sym e = { 0 };
			if (lib_mode) {
				AotSym f = { 0 };
				f.kind = SYM_FUNC;
				f.text = fa[k].name;
				sym_name(name, sizeof name, &f);
				e.st_name = out_str(&strtab, name);
				e.st_info = ELF64_ST_INFO(STB_GLOBAL, STT_FUNC);
				e.st_shndx = 1;
				e.st_value = fa[k].addr - (sljit_uw)a;
				out_put(&symtab, &e, sizeof e);
				nsyms++;
				memset(&e, 0, sizeof e);
			}
			if (!strcmp(fa[k].name, "main"))
				strcpy(name, "cji_main");
			else if (!strncmp(fa[k].name, "$nw", 3)) {
				snprintf(name, sizeof name, "cji_%s", fa[k].name + 1);
				name[strcspn(name, ".")] = '\0';
			} else
				continue;
			e.st_name = out_str(&strtab, name);
			e.st_info = ELF64_ST_INFO(STB_GLOBAL, STT_FUNC);
			e.st_shndx = 1;
			e.st_value = fa[k].addr - (sljit_uw)a;
			out_put(&symtab, &e, sizeof e);
			nsyms++;
		}
		if (!lib_mode) {
			Elf64_Sym e = { 0 };
			e.st_name = out_str(&strtab, "cji_snapshot");   /* chapter 27 */
			e.st_info = ELF64_ST_INFO(STB_GLOBAL, STT_OBJECT);
			e.st_shndx = 2;
			e.st_value = (Elf64_Addr)snap_at;
			out_put(&symtab, &e, sizeof e);
			nsyms++;
		}
		if (!aot_syms[error_shape_sym].ext) {
			Elf64_Sym e = { 0 };
			e.st_name = out_str(&strtab, "cji_error_shape");
			e.st_info = ELF64_ST_INFO(STB_GLOBAL, STT_OBJECT);
			e.st_shndx = 2;
			e.st_value = (Elf64_Addr)data_at[error_shape_sym];
			e.st_size = 8 * 4;
			out_put(&symtab, &e, sizeof e);
			nsyms++;
		}
		/* chapter 28: a shared unit's literals and static closures, under names every unit computes */
		for (int i = 0; lib_mode && i < naot_syms; i++)
			if (!aot_syms[i].ext && (aot_syms[i].kind == SYM_STRING || aot_syms[i].kind == SYM_SHAPE || aot_syms[i].kind == SYM_CLOSURE)) {
				char name[80];
				Elf64_Sym e = { 0 };
				sym_name(name, sizeof name, &aot_syms[i]);
				e.st_name = out_str(&strtab, name);
				e.st_info = ELF64_ST_INFO(STB_GLOBAL, STT_OBJECT);
				e.st_shndx = 2;
				e.st_value = (Elf64_Addr)data_at[i];
				out_put(&symtab, &e, sizeof e);
				nsyms++;
			}
		/* the runtime's functions and globals, undefined here (chapter 28: and the shared unit's) */
		for (int i = 0; i < naot_syms; i++)
			if (by_symbol(&aot_syms[i])) {
				char name[80];
				Elf64_Sym e = { 0 };
				sym_name(name, sizeof name, &aot_syms[i]);
				e.st_name = out_str(&strtab, name);
				e.st_info = ELF64_ST_INFO(STB_GLOBAL, STT_NOTYPE);
				e.st_shndx = SHN_UNDEF;
				out_put(&symtab, &e, sizeof e);
				elf_sym[i] = nsyms++;
			}
		/* the relocations */
		for (int r = 0; r < nrelocs; r++) {
			Elf64_Rela e;
			int i = relocs[r].sym;
			e.r_offset = relocs[r].offset;
			if (i < 0)
				e.r_info = ELF64_R_INFO(1, R_X86_64_64), e.r_addend = relocs[r].addend;
			else if (by_symbol(&aot_syms[i]))
				e.r_info = ELF64_R_INFO(elf_sym[i], R_X86_64_64), e.r_addend = relocs[r].addend;
			else
				e.r_info = ELF64_R_INFO(2, R_X86_64_64), e.r_addend = data_at[i] + relocs[r].addend;
			out_put(&rela, &e, sizeof e);
		}
		for (int r = 0; r < ndrelocs; r++) {
			Elf64_Rela e;
			e.r_offset = drelocs[r].offset;
			e.r_info = ELF64_R_INFO(drelocs[r].sym >= 0 ? elf_sym[drelocs[r].sym] : drelocs[r].sym == -1 ? 1 : 2, R_X86_64_64);
			e.r_addend = drelocs[r].addend;
			out_put(&drela, &e, sizeof e);
		}
		/* the file: header, sections' contents, section headers */
		{
			Elf64_Ehdr h = { 0 };
			Elf64_Shdr sh[10] = { { 0 } };
			const char *names[] = { "", ".text", ".data", ".rela.text", ".rela.data", ".symtab", ".strtab", ".shstrtab", ".note.GNU-stack" };
			Elf64_Word nm[9];
			size_t off[9] = { 0 };
			for (int k = 0; k < 9; k++)
				nm[k] = out_str(&shstr, names[k]);
			out_put(&file, &h, sizeof h);
#define SECTION(k, buf, al) do { out_align(&file, al); off[k] = file.n; out_put(&file, (buf).d ? (buf).d : (unsigned char *)"", (buf).n); } while (0)
			{ Out t = { a, na, na }; SECTION(1, t, 16); }
			SECTION(2, data, 8);
			SECTION(3, rela, 8);
			SECTION(4, drela, 8);
			SECTION(5, symtab, 8);
			SECTION(6, strtab, 1);
			SECTION(7, shstr, 1);
			out_align(&file, 8);
			h.e_shoff = file.n;
			sh[1] = (Elf64_Shdr){ nm[1], SHT_PROGBITS, SHF_ALLOC | SHF_EXECINSTR, 0, off[1], na, 0, 0, 16, 0 };
			sh[2] = (Elf64_Shdr){ nm[2], SHT_PROGBITS, SHF_ALLOC | SHF_WRITE, 0, off[2], data.n, 0, 0, 8, 0 };
			sh[3] = (Elf64_Shdr){ nm[3], SHT_RELA, SHF_INFO_LINK, 0, off[3], rela.n, 5, 1, 8, sizeof(Elf64_Rela) };
			sh[4] = (Elf64_Shdr){ nm[4], SHT_RELA, SHF_INFO_LINK, 0, off[4], drela.n, 5, 2, 8, sizeof(Elf64_Rela) };
			sh[5] = (Elf64_Shdr){ nm[5], SHT_SYMTAB, 0, 0, off[5], symtab.n, 6, (Elf64_Word)nlocals, 8, sizeof(Elf64_Sym) };
			sh[6] = (Elf64_Shdr){ nm[6], SHT_STRTAB, 0, 0, off[6], strtab.n, 0, 0, 1, 0 };
			sh[7] = (Elf64_Shdr){ nm[7], SHT_STRTAB, 0, 0, off[7], shstr.n, 0, 0, 1, 0 };
			sh[8] = (Elf64_Shdr){ nm[8], SHT_PROGBITS, 0, 0, off[7], 0, 0, 0, 1, 0 };
			out_put(&file, sh, sizeof(Elf64_Shdr) * 9);
			memcpy(h.e_ident, ELFMAG, SELFMAG);
			h.e_ident[EI_CLASS] = ELFCLASS64;
			h.e_ident[EI_DATA] = ELFDATA2LSB;
			h.e_ident[EI_VERSION] = EV_CURRENT;
			h.e_type = ET_REL;
			h.e_machine = EM_X86_64;
			h.e_version = EV_CURRENT;
			h.e_ehsize = sizeof h;
			h.e_shentsize = sizeof(Elf64_Shdr);
			h.e_shnum = 9;
			h.e_shstrndx = 7;
			memcpy(file.d, &h, sizeof h);
		}
		free(elf_sym);
	}
	{
		FILE *o = fopen(out_path, "wb");
		if (!o || fwrite(file.d, 1, file.n, o) != file.n) {
			perror(out_path);
			return 2;
		}
		fclose(o);
	}
	if (lib_mode && lib_list) {   /* chapter 28: what the shared unit exports */
		FILE *o = fopen(lib_list, "w");
		if (!o) {
			perror(lib_list);
			return 2;
		}
		for (int k = 0; k < nfa; k++)
			fprintf(o, "f %s\n", fa[k].name);
		for (int i = 0; i < naot_syms; i++)
			if (!aot_syms[i].ext && (aot_syms[i].kind == SYM_STRING || aot_syms[i].kind == SYM_SHAPE || aot_syms[i].kind == SYM_CLOSURE))
				fprintf(o, "%c %s\n", aot_syms[i].kind == SYM_STRING ? 's' : aot_syms[i].kind == SYM_SHAPE ? 'h' : 'c', aot_syms[i].text);
		fclose(o);
	}
	fprintf(stderr, "slas: %s: %lu bytes of code, %lu of data, %d + %d relocations", out_path,
		(unsigned long)na, (unsigned long)data.n, nrelocs, ndrelocs);
	if (snap_words > 0)
		fprintf(stderr, "; a snapshot of %lld words, %d functions", (long long)snap_words, nfa);
	fputc('\n', stderr);
	return 0;
}

#ifdef CJI_RV32
#include "rv32_obj.c"
#endif

#ifndef SLAS_LIBRARY
int main(int argc, char **argv)
{
	int verbose = 0, gc_stats = 0;
	long heap_bytes = 512, root_bytes = 1 << 16;
	const char *code_out = NULL, *aot_out = NULL, *snap_out = NULL, *snap_in = NULL;
	FILE *f;
	sljit_sw (SLJIT_FUNC *entry)(void);
	sljit_sw status;

	for (int i = 1; i < argc; i++) {
		if (!strcmp(argv[i], "-v"))
			verbose = 1;
		else if (!strcmp(argv[i], "-x") && i + 1 < argc)
			code_out = argv[++i];
		else if (!strcmp(argv[i], "-h") && i + 1 < argc)
			heap_bytes = atol(argv[++i]);
		else if (!strcmp(argv[i], "-r") && i + 1 < argc)   /* CJI-3: the root stack's bytes */
			root_bytes = atol(argv[++i]);
		else if (!strcmp(argv[i], "-H") && i + 1 < argc)   /* CJI-3: the heap's cap */
			rt_heap_cap = atol(argv[++i]);
		else if (!strcmp(argv[i], "-G") && i + 1 < argc)   /* CJI-3: grow while live data fill more than 1/R */
			rt_heap_ratio = atol(argv[++i]);
		else if (!strcmp(argv[i], "-C"))   /* CJI-3 7c: the mark-compact collector */
			rt_gc_compact = 1;
		else if (!strcmp(argv[i], "-Y"))   /* CJI-3: the hybrid collector */
			rt_gc_compact = 2;
		else if (!strcmp(argv[i], "-M") && i + 1 < argc)   /* CJI-3: the memory the heap's spaces may take */
			rt_gc_memory = atol(argv[++i]);
		else if (!strcmp(argv[i], "--")) {   /* CJI-3: the rest are the program's (rt_argv) */
			rt_argc = argc - i - 1;
			rt_argv = argv + i + 1;
			break;
		}
		else if (!strcmp(argv[i], "-g"))
			gc_stats = 1;
		else if (!strcmp(argv[i], "-c") && i + 1 < argc)   /* chapter 26: an object, ahead of time */
			aot_out = argv[++i];
		else if (!strcmp(argv[i], "-S"))   /* chapter 27: no snapshot: the world runs main at start */
			snapshots = 0;
		else if (!strcmp(argv[i], "--lib") && i + 1 < argc)   /* chapter 28: a shared unit, and its list */
			lib_mode = 1, lib_list = argv[++i];
		else if (!strcmp(argv[i], "--extern") && i + 1 < argc)   /* chapter 28: a world without the shared unit */
			read_externs(argv[++i]);
		else if (!strcmp(argv[i], "-p") && i + 1 < argc)   /* chapter 28: the text it assembles, written out */
			pruned_out = argv[++i];
		else if (!strcmp(argv[i], "--snapshot-out") && i + 1 < argc)   /* CJI-4: take the snapshot, write it, stop */
			snap_out = argv[++i];
		else if (!strcmp(argv[i], "--snapshot") && i + 1 < argc)   /* CJI-4: slas-rv32: the one the host's slas took */
			snap_in = argv[++i];
#ifdef CJI_RV32
		else if (!strcmp(argv[i], "--module"))   /* CJI-4: -c writes the board's module (rv32_mod.c) */
			rv32_module = 1;
		else if (!strcmp(argv[i], "--rootstack") && i + 1 < argc)   /* CJI-4: the module's root stack, in bytes */
			rv32_rootstack = atol(argv[++i]);
		else if (!strcmp(argv[i], "--rootstack-slack") && i + 1 < argc)   /* CJI-4: what its embedder keeps past the end */
			rootstack_slack = atol(argv[++i]);
#endif
		else
			src_name = argv[i];
	}
	if (!src_name) {
		fprintf(stderr, "usage: slas [-v] [-g] [-x code.bin] [-h heap-bytes] [-r root-bytes] [-c out.o [-S]] prog.slir [-- args]\n");
		return 2;
	}
	f = fopen(src_name, "r");
	if (!f) {
		perror(src_name);
		return 2;
	}
	if (aot_out || snap_out) {   /* chapter 26: the program's text, assembled twice, to an object */
		char *text = NULL;
		size_t len = 0, cap = 0, got;
		do {
			if (len + 65536 > cap && !(text = realloc(text, cap = 2 * cap + 65536)))
				die("out of memory");
			got = fread(text + len, 1, 65536, f);
			len += got;
		} while (got);
		fclose(f);
		if (!(text = realloc(text, len + 1)))
			die("out of memory");
		text[len] = '\0';   /* (chapter 27 searches it) */
#ifdef CJI_RV32
		if (snap_out)
			die("--snapshot-out: slas-rv32 cannot run main; the host's slas takes the snapshot");
#else
		if (snap_in)
			die("--snapshot is for slas-rv32: slas -c takes its own");
#endif
		if (snap_out) {   /* CJI-4: the snapshot only, as text, and the text it leaves (-p) */
			const char *why = lib_mode ? "a shared unit" : !snapshots ? "-S" : !strstr(text, "function $nwInit") ? "not a world"
				: take_snapshot(text, len) ? "main cannot run at build time" : "";
			if (snap_words > 0)
				text = prune_text(text, &len, 1);
			if (pruned_out) {
				FILE *o = fopen(pruned_out, "w");
				if (!o || fwrite(text, 1, len, o) != len || fclose(o)) {
					perror(pruned_out);
					return 2;
				}
			}
			return write_snapshot(snap_out, why);
		}
		if (snap_in)
			read_snapshot(snap_in);
#ifdef CJI_RV32
		return rv32_aot(text, len, aot_out);
#else
		return slas_aot(text, len, aot_out);
#endif
	}
	if (slas_load(f, verbose, code_out))
		return 2;
	fclose(f);
	entry = (sljit_sw (SLJIT_FUNC *)(void))slas_function("main");
	if (!entry) {
		fprintf(stderr, "slas: no function main\n");
		return 2;
	}
	rt_initialize((heap_bytes + 7) / 8 * 8, (root_bytes + 7) / 8 * 8);
	status = entry();
	fflush(stdout);
	if (gc_stats)
		fprintf(stderr, "slas: %lld collections, %lld bytes copied, heap now %lld bytes, most live %lld bytes, spilled %lld bytes%s\n",
			(long long)rt_collections, (long long)rt_copied_bytes,
			(long long)((fromspace_end - fromspace_begin) * 8), (long long)rt_live_max, (long long)rt_spill_bytes, rt_gc_compact == 1 ? ", mark-compact" : rt_gc_compact == 2 ? ", hybrid" : "");
	if (gc_stats && rt_gc_compact == 2)   /* (CJI-3: how many of the hybrid's collections compacted) */
		fprintf(stderr, "%s: %lld compacting\n", "cji", (long long)rt_hybrid_compactions);
	sljit_free_code(code, NULL);
	return (int)status;
}
#endif
