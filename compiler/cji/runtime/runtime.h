/* The C runtime that compiled programs call: printing, run-time errors, and (from chapter 6)
 * the heap and its garbage collector. slas links it and tells SLJIT the addresses. */
#ifndef CJI_RUNTIME_H
#define CJI_RUNTIME_H

#include <stddef.h>
#include <stdint.h>

/* The heap. Compiled code allocates inline: it reads free_ptr, adds the object's size,
 * and calls rt_collect first if that would pass fromspace_end. */
extern int64_t *free_ptr, *fromspace_begin, *fromspace_end;
/* The root stack: slots for every pointer that must survive a collection. s0 holds its top. */
extern int64_t *rootstack_begin, *rootstack_end;
extern int64_t exc_flag, exc_value;   /* chapter 14 */
int64_t error_shape(void);           /* in slas.c: the static shape of an Error */
void rt_uncaught(int64_t v);
int64_t rt_num_to_radix(int64_t n, int64_t r, int64_t *roots);
int64_t rt_num_to_fixed(int64_t n, int64_t d, int64_t *roots);
int64_t rt_num_to_precision(int64_t n, int64_t d, int64_t *roots);
int64_t rt_arr_resize(int64_t a, int64_t n, int64_t fill, int64_t *roots);
int64_t rt_any_is_array(int64_t a);
int64_t rt_any_length(int64_t a);
int64_t rt_any_arity(int64_t a);
int64_t rt_any_unhole(int64_t v);

#ifdef CJI_PROFILE_GC
/* The benchmark embedder chooses the clock unit (microseconds or guest steps). */
extern int64_t (*rt_profile_clock)(void);
extern int64_t rt_gc_ticks, rt_slide_bytes;
#endif
extern int64_t rt_collections, rt_copied_bytes;   /* statistics, for slas -g */

void rt_initialize(int64_t heap_bytes, int64_t rootstack_bytes);
void rt_collect(int64_t **rootstack_top, int64_t bytes);
/* chapter 27: the heap after a world's main, as data (slas -c), and back */
int64_t rt_snapshot(int64_t **image, uint64_t **map, int64_t entries[2], int (*outside)(int64_t at, int64_t v, int role));
void rt_load_snapshot(const int64_t *snap);
/* chapter 31: native primitives (library functions named $nat_NAME) */
int64_t rt_key_hash(int64_t k);
int64_t rt_gc_epoch(void);
int64_t rt_id_char(int64_t u, int64_t cont);   /* CJI-3 */
/* CJI-3, step 6: the stage-1 compiler's input and output, and a double's word as text; the
   program's own arguments (slas: those after --) */
extern int rt_argc;
extern char **rt_argv;
int64_t rt_read_input(int64_t *roots);
int64_t rt_write_output(int64_t s);
int64_t rt_arg_native(void);
int64_t rt_arg_flag(int64_t name);
int64_t rt_arg_value(int64_t name, int64_t *roots);
int64_t rt_read_file(int64_t path, int64_t *roots);
int64_t rt_pass_live(int64_t name, int64_t ms, int64_t *roots);
int64_t rt_spill_put(int64_t s);
int64_t rt_spill_get(int64_t id, int64_t *roots);
extern int64_t rt_spill_bytes;   /* the bytes spilled to the file store (-g) */
void rt_spill_reset(void);         /* CJI-4: the store emptied, its file closed */
int64_t rt_double_bits(int64_t d, int64_t high, int64_t *roots);
/* CJI-3, lane 6: packed sets, integer vectors and the interference graph (src/bitsets.js) */
int64_t rt_bits_new(int64_t words, int64_t *roots);
int64_t rt_bits_words(int64_t s);
int64_t rt_bits_has(int64_t s, int64_t x);
int64_t rt_bits_add(int64_t s, int64_t x);
int64_t rt_bits_remove(int64_t s, int64_t x);
int64_t rt_bits_or(int64_t d, int64_t s);
int64_t rt_bits_and(int64_t d, int64_t s, int64_t m);
int64_t rt_bits_equal(int64_t a, int64_t b);
int64_t rt_bits_next(int64_t s, int64_t from);
int64_t rt_bits_first_free(int64_t s);
int64_t rt_bits_grow(int64_t s, int64_t words, int64_t *roots);
int64_t rt_ints_new(int64_t n, int64_t *roots);
int64_t rt_ints_length(int64_t a);
int64_t rt_ints_get(int64_t a, int64_t i);
int64_t rt_ints_set(int64_t a, int64_t i, int64_t v);
int64_t rt_bits_add_all(int64_t s, int64_t a, int64_t p);
int64_t rt_bits_remove_all(int64_t s, int64_t a, int64_t p);
int64_t rt_graph_new(int64_t n, int64_t *roots);
int64_t rt_graph_add_live(int64_t g, int64_t d, int64_t live, int64_t *roots);
int64_t rt_graph_add_cross(int64_t g, int64_t a, int64_t b, int64_t *roots);
int64_t rt_graph_row(int64_t g, int64_t u, int64_t out);
int64_t rt_graph_word(int64_t g, int64_t u, int64_t w);
extern int64_t rt_live_max;   /* the most bytes live after a collection (slas -g) */
extern int64_t rt_heap_cap;   /* the heap's cap in bytes, or 0 (slas and aot_main -H) */
extern int64_t rt_heap_ratio;   /* grow while live data fill more than 1/ratio of the heap, or 0 (-G) */
extern int64_t rt_gc_compact;   /* CJI-3 7c: 1 mark-compact (-C, CJI_GC=compact), 2 hybrid (-Y, CJI_GC=hybrid) */
extern int64_t rt_gc_memory;    /* the hybrid's memory for the heap's spaces (-M, CJI_GC_MEMORY), or 0: the cap */
extern int64_t rt_hybrid_compactions;
extern int64_t rt_gc_stress;    /* collect after every this many bytes allocated (CJI_GC_STRESS), or 0 */
extern int64_t rt_mark_rescans;
/* CJI-3: units compiled on their own */
extern int64_t rt_exports[2];
int64_t rt_export(int64_t r, int64_t record);
int64_t rt_import(int64_t r, int64_t k);
extern void (*rt_fatal)(const char *msg);   /* chapter 27: a fatal error while slas runs main (CJI-4: or a world on the board) */
/* CJI-4: one world's allocations (its heap, root stack, call buffers): on the board, its module's malloc */
extern void *(*rt_malloc)(size_t);
extern void *(*rt_realloc)(void *, size_t);
extern void (*rt_free)(void *);
void rt_print_int(int64_t v);
void rt_print_bool(int64_t v);
void rt_index_error(void);
void rt_rootstack_overflow(void);   /* CJI-4 */

/* Chapter 9: dynamic values, NaN-boxed (runtime.c). Each takes and returns words. */
int64_t rt_any_add(int64_t a, int64_t b, int64_t *roots);
int64_t rt_any_sub(int64_t a, int64_t b);
int64_t rt_any_mul(int64_t a, int64_t b);
int64_t rt_any_div(int64_t a, int64_t b);
int64_t rt_any_neg(int64_t a);
int64_t rt_any_lt(int64_t a, int64_t b);
int64_t rt_any_le(int64_t a, int64_t b);
int64_t rt_any_gt(int64_t a, int64_t b);
int64_t rt_any_ge(int64_t a, int64_t b);
int64_t rt_any_eq(int64_t a, int64_t b);
int64_t rt_any_truthy(int64_t a);
int64_t rt_any_typeof(int64_t a);
int64_t rt_any_from_int(int64_t n);
int64_t rt_any_to_int(int64_t a);
int64_t rt_any_to_bool(int64_t a);
int64_t rt_any_to_array(int64_t a);
int64_t rt_any_to_function(int64_t a, int64_t arity);
void rt_any_print(int64_t a);

/* Chapter 10: numbers (a Number is a double's 64 bits in a word), and console.log of several
 * values: put_ prints a value and a space, print_ a value and the end of the line. */
void rt_print_num(int64_t bits);
void rt_put_int(int64_t v);
void rt_put_bool(int64_t v);
void rt_put_num(int64_t bits);
void rt_any_put(int64_t a);
int64_t rt_int_mod(int64_t a, int64_t b);
int64_t rt_num_mod(int64_t a, int64_t b);
int64_t rt_num_to_int32(int64_t bits);
int64_t rt_any_to_int32(int64_t a);
int64_t rt_any_mod(int64_t a, int64_t b);
int64_t rt_num_to_int(int64_t bits);
int64_t rt_num_pow(int64_t a, int64_t b);
int64_t rt_any_pow(int64_t a, int64_t b);
int64_t rt_any_loose_eq(int64_t a, int64_t b);
int64_t rt_math_floor(int64_t a);
int64_t rt_math_ceil(int64_t a);
int64_t rt_math_round(int64_t a);
int64_t rt_math_trunc(int64_t a);
int64_t rt_math_abs(int64_t a);
int64_t rt_math_sign(int64_t a);
int64_t rt_math_sqrt(int64_t a);
int64_t rt_math_cbrt(int64_t a);
int64_t rt_math_exp(int64_t a);
int64_t rt_math_log(int64_t a);
int64_t rt_math_log2(int64_t a);
int64_t rt_date_now(void);
int64_t rt_date_tz(int64_t a);
int64_t rt_date_clock(int64_t a);
/* chapter 24: a native world's system calls (the embedder sets the hooks and the event) */
typedef int64_t (*rt_kernel_call_fn)(int op, int a, int b, int64_t c, const char *s0, size_t n0, const char *s1, size_t n1,
	const char *s2, size_t n2, char *out, size_t out_n);
typedef int (*rt_kernel_error_fn)(char *buf, size_t n);
typedef struct { int kind, second, timer, token; const char *type, *json; int json_len; const char *from; double seed; } rt_event_t;
extern rt_kernel_call_fn rt_kernel_call;
extern rt_kernel_error_fn rt_kernel_error;
extern rt_event_t rt_event;
int64_t rt_host_arg(int64_t k, int64_t v);
int64_t rt_host_call(int64_t op, int64_t a, int64_t b, int64_t *roots);
int64_t rt_host_event(int64_t i, int64_t *roots);
int64_t rt_host_entries(int64_t init, int64_t event);
extern int64_t rt_entries[2];
/* Chapter 28: one runtime, several worlds. Everything the runtime keeps for one world; on the board
 * the runtime would be the firmware's, once, and each world's bridge swaps its own state in when
 * the kernel calls the world and out when it returns (rt_swap exchanges the two). */
struct rt_state {
	int64_t *free_ptr, *fromspace_begin, *fromspace_end, *rootstack_begin, *rootstack_end;
	int64_t entries[2], collections, copied_bytes, exc_flag, exc_value;
	int64_t exports[2];   /* CJI-3 */
	double virtual_clock;
	rt_kernel_call_fn kernel_call;
	rt_kernel_error_fn kernel_error;
	rt_event_t event;
	char *host_s[3];
	size_t host_n[3], host_cap[3];
	int host_set[3];
	int64_t host_c;
	void *(*mem_malloc)(size_t);   /* CJI-4: rt_malloc, rt_realloc, rt_free */
	void *(*mem_realloc)(void *, size_t);
	void (*mem_free)(void *);
};
void rt_state_init(struct rt_state *s);   /* a world that has not started */
void rt_swap(struct rt_state *s);
int64_t rt_math_sinh(int64_t a);
int64_t rt_math_cosh(int64_t a);
int64_t rt_math_tanh(int64_t a);
int64_t rt_math_asinh(int64_t a);
int64_t rt_math_acosh(int64_t a);
int64_t rt_math_atanh(int64_t a);
int64_t rt_math_log10(int64_t a);
int64_t rt_math_sin(int64_t a);
int64_t rt_math_cos(int64_t a);
int64_t rt_math_tan(int64_t a);
int64_t rt_math_atan(int64_t a);
int64_t rt_math_asin(int64_t a);
int64_t rt_math_acos(int64_t a);
int64_t rt_math_fround(int64_t a);
int64_t rt_int_abs(int64_t a);
int64_t rt_int_sign(int64_t a);
int64_t rt_math_clz32(int64_t a);
int64_t rt_math_atan2(int64_t a, int64_t b);
int64_t rt_math_hypot(int64_t a, int64_t b);
int64_t rt_num_min(int64_t a, int64_t b);
int64_t rt_num_max(int64_t a, int64_t b);
int64_t rt_int_min(int64_t a, int64_t b);
int64_t rt_int_max(int64_t a, int64_t b);
int64_t rt_math_imul(int64_t a, int64_t b);

int64_t rt_any_to_number(int64_t a);


/* chapter 13: strings and records */
int64_t rt_static_string(const uint16_t *u, int64_t n);
void rt_print_str(int64_t a0);
void rt_put_str(int64_t a0);
int64_t rt_str_concat(int64_t a0, int64_t a1, int64_t *roots);
int64_t rt_str_eq(int64_t a0, int64_t a1);
int64_t rt_str_cmp(int64_t a0, int64_t a1);
int64_t rt_str_index(int64_t a0, int64_t a1, int64_t *roots);
int64_t rt_int_to_str(int64_t a0, int64_t *roots);
int64_t rt_num_to_str(int64_t a0, int64_t *roots);
int64_t rt_bool_to_str(int64_t a0);
int64_t rt_any_to_str(int64_t a0, int64_t *roots);
int64_t rt_any_as_str(int64_t a0);
int64_t rt_any_typeof_str(int64_t a0);
int64_t rt_str_fromCharCode(int64_t a0, int64_t *roots);
int64_t rt_arr_join(int64_t a0, int64_t a1, int64_t a2, int64_t *roots);
int64_t rt_any_get(int64_t a0, int64_t a1);
int64_t rt_any_set(int64_t a0, int64_t a1, int64_t a2, int64_t *roots);
int64_t rt_any_index(int64_t a0, int64_t a1, int64_t *roots);
int64_t rt_any_set_index(int64_t a0, int64_t a1, int64_t a2, int64_t *roots);
int64_t rt_any_delete(int64_t a0, int64_t a1, int64_t *roots);
int64_t rt_any_in(int64_t a0, int64_t a1, int64_t *roots);
int64_t rt_any_keys(int64_t a0, int64_t *roots);
int64_t rt_any_to_record(int64_t a0, int64_t a1);
int64_t rt_str_charAt(int64_t a0, int64_t a1, int64_t *roots);
int64_t rt_str_charCodeAt(int64_t a0, int64_t a1);
int64_t rt_str_indexOf(int64_t a0, int64_t a1, int64_t a2);
int64_t rt_str_lastIndexOf(int64_t a0, int64_t a1, int64_t a2);
int64_t rt_str_includes(int64_t a0, int64_t a1, int64_t a2);
int64_t rt_str_startsWith(int64_t a0, int64_t a1, int64_t a2);
int64_t rt_str_endsWith(int64_t a0, int64_t a1, int64_t a2);
int64_t rt_str_slice(int64_t a0, int64_t a1, int64_t a2, int64_t *roots);
int64_t rt_str_substring(int64_t a0, int64_t a1, int64_t a2, int64_t *roots);
int64_t rt_str_toUpperCase(int64_t a0, int64_t *roots);
int64_t rt_str_toLowerCase(int64_t a0, int64_t *roots);
int64_t rt_str_trim(int64_t a0, int64_t a1, int64_t *roots);
int64_t rt_str_repeat(int64_t a0, int64_t a1, int64_t *roots);
int64_t rt_str_padStart(int64_t a0, int64_t a1, int64_t a2, int64_t *roots);
int64_t rt_str_padEnd(int64_t a0, int64_t a1, int64_t a2, int64_t *roots);
int64_t rt_str_split(int64_t a0, int64_t a1, int64_t *roots);

#endif
