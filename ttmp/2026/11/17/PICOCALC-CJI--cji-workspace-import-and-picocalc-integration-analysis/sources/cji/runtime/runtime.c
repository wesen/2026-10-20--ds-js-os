/* The C runtime: printing, run-time errors, and a copying garbage collector (chapter 6).
 *
 * Every heap object is a header word followed by its fields, one word each:
 *
 *     header = mask << 16 | length << 3 | kind << 1 | 1
 *
 * kind 0: no field is a pointer (an Int[]); kind 1: every field is a pointer (an Int[][]);
 * kind 2 (chapter 8): field i is a pointer if bit i of mask is set (a closure, which holds a
 * code address, integers and pointers side by side). A kind-2 object has at most 30 fields.
 * The low bit is 1 in every header and 0 in every pointer, because objects are 8-byte
 * aligned: after an object is copied, the collector overwrites its header with its new
 * address, and the low bit tells the two apart.
 *
 * Chapter 8: a pointer outside the space being collected is to a static object (a closure
 * of a function with no free variables, made once by slas) and is left alone.
 *
 * Chapter 9: a kind-2 object has at most 30 fields, and bits 46 to 51 of its header hold
 * the arity of the closure's function. A word of type Any may be a pointer or not (see the
 * end of this file); one that is not is never inside the heap, so the collector leaves it
 * alone without being told which words are dynamic.
 *
 * The collector is Cheney's: copy each object the roots point to into an empty space,
 * then scan the copies in order, copying what their pointer elements point to, until the
 * scan catches up with the end of the copies. Everything not copied is garbage. If the
 * live data plus the request does not fit afterwards, the heap doubles. */
#define _DEFAULT_SOURCE   /* chapter 21: localtime_r, tm_gmtoff, clock_gettime under -std=c11 */
#include <math.h>
#include <time.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>


#include "runtime.h"
#include "casemap.h"   /* chapter 13 */
#include "idtable.h"   /* CJI-3: rt_id_char */

int64_t *free_ptr, *fromspace_begin, *fromspace_end;
int64_t *rootstack_begin, *rootstack_end;
/* chapter 24: a native world's two entries, closures the embedder calls between events (roots) */
int64_t rt_entries[2];
/* CJI-3: the export record of a unit compiled on its own (the world runtime), which a world's start
   reads with rt_import; a root while it is set, and gone from the snapshot (nothing reads it later) */
int64_t rt_exports[2];
int64_t rt_collections, rt_copied_bytes;
int64_t rt_live_max;   /* CJI-3: the most bytes live after any collection (slas -g) */
int64_t rt_heap_cap;   /* CJI-3: when set, the heap may not grow past this many bytes (-H) */
int64_t rt_heap_ratio;   /* CJI-3: when set, the heap also grows while live data fill more than 1/ratio of it (-G) */
/* CJI-3 7c: the collector: 0 copying (two semispaces during a collection, the default), 1 mark-compact
   (one space: compact_collect below), 2 hybrid (each collection copies when two spaces fit in the
   memory given, rt_gc_memory or the cap, and compacts when they do not: copy_fits). Chosen before
   rt_initialize (-C, -Y), or by CJI_GC=compact or CJI_GC=hybrid in the environment. rt_gc_stress: collect whenever this many bytes have been allocated since the last
   collection (CJI_GC_STRESS=N), a test of the collector; 0 for normal running. */
int64_t rt_gc_compact, rt_gc_stress;
int64_t rt_gc_memory;   /* (the hybrid collector: the bytes the heap's spaces may take, -M or CJI_GC_MEMORY; 0: the cap) */
static int rt_gc_trace;   /* (CJI_GC_TRACE: say why the heap grows) */
static int64_t *stress_end;   /* (with rt_gc_stress: the heap's real end; fromspace_end is lowered) */
/* chapter 31: rt_gc_epoch's high part, raised whenever a snapshot is loaded (so an epoch read before
   the snapshot was taken never equals one read after it is loaded) */
static int64_t rt_epoch_base;

/* CJI-4 (chapter 30): what belongs to one world (its heap's spaces, its root stack, a system call's
   buffers) is allocated through these; on the board they are the world's module's malloc, realloc and
   free, which the kernel charges to the world and frees with it (runtime/cji_elf.c sets them). What the
   runtime keeps for every world (static strings, cached TypeErrors) stays the C library's. */
void *(*rt_malloc)(size_t) = malloc;
void *(*rt_realloc)(void *, size_t) = realloc;
void (*rt_free)(void *) = free;
/* chapter 27: slas sets this while it runs a world's main at build time; CJI-4: the firmware's glue, while
   a world runs, so that the world crashes and the firmware does not stop. It does not return. */
void (*rt_fatal)(const char *msg);
static void world_fatal(const char *msg)
{
	if (rt_fatal)
		rt_fatal(msg);
}

static void *alloc_space(int64_t bytes)
{
	void *p = rt_malloc((size_t)bytes);
	if (!p) {
		world_fatal("out of memory");
		fprintf(stderr, "out of memory\n");
		exit(3);
	}
	return p;
}

/* (CJI-3 7c: with rt_gc_stress, fromspace_end is lowered so that compiled code's inline check
   calls rt_collect after rt_gc_stress more bytes; the real end waits in stress_end) */
static void stress_restore(void) { if (rt_gc_stress && stress_end) fromspace_end = stress_end; }
static void stress_lower(int64_t bytes)
{
	if (!rt_gc_stress)
		return;
	stress_end = fromspace_end;
	if (fromspace_end - free_ptr > (rt_gc_stress + bytes) / 8 + 1)
		fromspace_end = free_ptr + (rt_gc_stress + bytes) / 8 + 1;
}

void rt_initialize(int64_t heap_bytes, int64_t rootstack_bytes)
{
#ifndef __riscv   /* (the firmware has no environment) */
	const char *gc = getenv("CJI_GC"), *stress = getenv("CJI_GC_STRESS");
	if (gc && !strcmp(gc, "compact"))
		rt_gc_compact = 1;
	if (gc && !strcmp(gc, "hybrid"))
		rt_gc_compact = 2;
	if (getenv("CJI_GC_MEMORY") && atol(getenv("CJI_GC_MEMORY")) > 0)
		rt_gc_memory = atol(getenv("CJI_GC_MEMORY"));
	if (stress && atol(stress) > 0)
		rt_gc_stress = atol(stress);
	rt_gc_trace = getenv("CJI_GC_TRACE") != NULL;
#endif
	fromspace_begin = free_ptr = alloc_space(heap_bytes);
	fromspace_end = fromspace_begin + heap_bytes / 8;
	rootstack_begin = alloc_space(rootstack_bytes);
	rootstack_end = rootstack_begin + rootstack_bytes / 8;
	stress_lower(0);
}

static int64_t *from_begin, *from_end;   /* the space being collected */

static int64_t kind_of(int64_t h) { return (h >> 1) & 3; }
static int64_t length_of(int64_t h) { return kind_of(h) == 2 ? (h >> 3) & 0x1fff : h >> 3; }
static int64_t arity_of(int64_t h) { return (h >> 46) & 63; }
/* Chapter 15: an array is a kind-2 object with bits 52 and 51 set (a record has only 52):
 * [header, length, storage], the storage a plain object (kind 0 or 1) as big as the array's
 * capacity. (Not bit 53: the machine model keeps words in doubles, exact below 2^53.) */
#define ARRAY_TAG (3LL << 51)
#define ARRAY_HEADER (ARRAY_TAG | (2LL << 16) | (2 << 3) | (2 << 1) | 1)
static int is_array(int64_t w);
static int64_t arr_len(int64_t a) { return ((int64_t *)a)[1]; }
static int64_t *arr_elems(int64_t a) { return (int64_t *)((int64_t *)a)[2] + 1; }
static int is_pointer_field(int64_t h, int64_t i)   /* i from 0 */
{
	return kind_of(h) == 1 || (kind_of(h) == 2 && ((h >> 16) >> i) & 1);
}

/* Copies the object the word w points to into the space being filled at *next, unless it
 * was copied already, and returns the word that replaces w: the copy's address, or w itself
 * when it points nowhere in the space being collected. (Chapter 29: w stays a whole word
 * throughout. Where a C pointer is 32 bits, turning every pointer field into a pointer would
 * cut a number stored in one, an Any[]'s element, to its low half.) */
static int64_t copy_word(int64_t w, int64_t **next)
{
	int64_t h, words;
	int64_t *p, *q;
	if ((uint64_t)w < (uint64_t)(uintptr_t)from_begin || (uint64_t)w >= (uint64_t)(uintptr_t)from_end)
		return w;   /* null, a static object, or no pointer at all */
	p = (int64_t *)(intptr_t)w;
	h = p[0];
	if (!(h & 1))                  /* forwarded: the header is the new address */
		return h;
	words = length_of(h) + 1;
	q = *next;
	if (words <= 8)   /* (CJI-3, lane 6: most objects are small; no call to memcpy for them) */
		for (int64_t i = 0; i < words; i++)
			q[i] = p[i];
	else
		memcpy(q, p, (size_t)words * 8);
	*next += words;
	p[0] = (int64_t)(intptr_t)q;
	return (int64_t)(intptr_t)q;
}

/* Copies everything reachable from the roots out of [begin, end) into `to`; returns the end
 * of the copies. */
static int64_t *cheney(int64_t **rootstack_top, int64_t *begin, int64_t *end, int64_t *to)
{
	int64_t *next = to, *scan;
	from_begin = begin;
	from_end = end;
	/* (the root stack's slots are words, 8 bytes, whatever a C pointer's size) */
	for (int64_t *r = rootstack_begin; r < (int64_t *)rootstack_top; r++)
		*r = copy_word(*r, &next);
	exc_value = copy_word(exc_value, &next);   /* chapter 14 */
	rt_entries[0] = copy_word(rt_entries[0], &next);   /* chapter 24 */
	rt_entries[1] = copy_word(rt_entries[1], &next);
	rt_exports[0] = copy_word(rt_exports[0], &next);   /* CJI-3: a unit's export records, while worlds start */
	rt_exports[1] = copy_word(rt_exports[1], &next);
	for (scan = to; scan < next; ) {
		int64_t h = scan[0], len = length_of(h);
		for (int64_t i = 0; i < len; i++)
			if (is_pointer_field(h, i))
				scan[i + 1] = copy_word(scan[i + 1], &next);
		scan += len + 1;
	}
	return next;
}

/* The heap's size after a collection that left `live` words and must make room for `bytes` more: the
 * same, or doubled until they fit (CJI-3: and, with a ratio, -G R, while the live data fill more than
 * 1/R of it, as far as the cap allows: a heap that grows only when full is collected again after a few
 * per cent of allocation once the live data are large, and stage 1 compiling the bundle spent nine
 * tenths of its time copying). Past the cap (-H), the program stops. */
static int64_t heap_words_for(int64_t live, int64_t bytes, int64_t words)
{
	int64_t w = words;
	while (live + bytes / 8 > w || (rt_heap_ratio && live * rt_heap_ratio > w && (!rt_heap_cap || w * 16 <= rt_heap_cap)))
		w *= 2;
	/* (CJI-3: doubling past the cap, a heap that fits within it grows to the cap instead) */
	if (w != words && rt_heap_cap && w * 8 > rt_heap_cap && (live + bytes / 8) * 8 <= rt_heap_cap && rt_heap_cap / 8 > words)
		w = rt_heap_cap / 8;
	if (w != words && rt_gc_trace)   /* CJI-3: why the heap grows (stage 1's measurements) */
		fprintf(stderr, "gc: heap to %lld bytes: %lld live, %lld asked for\n", (long long)w * 8, (long long)live * 8, (long long)bytes);
	if (w != words && rt_heap_cap && w * 8 > rt_heap_cap) {   /* CJI-3: a heap that may not grow past a cap (-H) */
		world_fatal("out of memory: the heap would grow past its cap");
		fprintf(stderr, "out of memory: the heap would grow to %lld bytes, past its cap of %lld (%lld live, %lld asked for)\n",
			(long long)w * 8, (long long)rt_heap_cap, (long long)live * 8, (long long)bytes);
		exit(4);
	}
	return w;
}

static void note_live(int64_t live)
{
	rt_collections++;
	if (live * 8 > rt_live_max)
		rt_live_max = live * 8;
}

/* The copying collector (chapter 6): everything the roots reach is copied into a new space as large;
 * when the heap must grow, copied once more into the bigger one. */
static int64_t *grow_in_place(int64_t **rootstack_top, int64_t *block, int64_t live, int64_t nw);
static void copy_collect(int64_t **rootstack_top, int64_t bytes)
{
	int64_t words = fromspace_end - fromspace_begin, nw;
	int64_t *to = alloc_space(words * 8);
	int64_t *end = cheney(rootstack_top, fromspace_begin, fromspace_end, to);
	note_live(end - to);
	rt_copied_bytes += (end - to) * 8;
	rt_free(fromspace_begin);
	fromspace_begin = to;   /* (CJI-4: the heap whole before heap_words_for may stop the program: a firmware that */
	fromspace_end = to + words;   /* catches the fatal error frees it, and nothing else) */
	free_ptr = end;
	if ((nw = heap_words_for(end - to, bytes, words)) != words) {
		if (rt_gc_compact == 2) {   /* (CJI-3, hybrid: no third space; the copy's block grows instead) */
			int64_t live = end - to;
			to = grow_in_place(rootstack_top, to, live, nw);
			end = to + live;
		} else {
			int64_t *bigger = alloc_space(nw * 8);
			end = cheney(rootstack_top, to, end, bigger);
			rt_free(to);
			to = bigger;
		}
		words = nw;
	}
	fromspace_begin = to;
	fromspace_end = to + words;
	free_ptr = end;
}

/* ---- CJI-3 7c: a mark-compact collector, so that a collection needs no second space ----------------
 *
 * The copying collector needs, during a collection, a second space as large as the heap: the process's
 * peak is twice the heap. This one slides the live objects down to the start of the one space, keeping
 * their order, with three tables made for the collection and freed after it:
 *
 *   live    a bitmap, one bit per word of the heap's used part: the words of every live object
 *           (header and fields), set by marking;
 *   before  for each 64 words, the live words before them: an object's new place is the heap's start
 *           plus before[its word / 64] plus the live words of its own 64 before it (a popcount);
 *   a mark stack of MARK_STACK objects whose fields wait to be marked; when it is full, the object is
 *           marked but not pushed, and once the stack is empty the heap's marked objects are scanned
 *           again for unmarked children, until none overflows.
 *
 * Their size is about 1/64 + 1/128 of the heap and 32 KB: the peak is the heap and 2.5%, where copying
 * needed twice the heap. No forwarding word is needed (the header has no spare one), so it is not
 * Lisp-2's layout: the new addresses come from the bitmap, as in a bitmap-marking compactor, and no
 * object is written before every pointer has been rewritten (the headers stay, so the heap can be
 * walked by them).
 *
 *   1. mark: from the roots (the root stack, the thrown value, the entries, the export records), every
 *      object a pointer field reaches, by its header (kind and mask, as cheney follows them);
 *   2. count: before[], and the live words;
 *   3. rewrite every root and every pointer field of a live object to its target's new address;
 *   4. slide: each live object, lowest first, moved down to its new address (memmove: a move never
 *      reaches the next object, which is above).
 *
 * The live objects are found by the bitmap: a run of set bits starts at a live object's header, and
 * live objects in one run follow each other by their headers' lengths. A pointer is a word in the used
 * part of the heap; anything else (static strings, shapes and closures, a snapshot's statics, a shared
 * unit's objects, numbers) is left as it is, as cheney leaves it.
 *
 * Growing: after compacting in place, a heap that must grow is moved to a larger block with realloc
 * (glibc moves a large block by remapping its pages, so the peak is the new block, not both), and
 * every pointer into the old block is shifted by the distance moved. */
#define MARK_STACK 4096
static int64_t *mc_begin, *mc_end;   /* the used part of the heap: [begin, free_ptr) */
static uint64_t *mc_live;
static uint32_t *mc_before;
static int64_t *mc_stack[MARK_STACK];
static int mc_sp, mc_overflow;
int64_t rt_mark_rescans;   /* (statistics: rescans after the mark stack overflowed) */

static uint64_t mc_lo, mc_hi;   /* (the same bounds, as numbers: growing tests against a freed block) */
static int mc_in_heap(int64_t w)
{
	return (uint64_t)w >= mc_lo && (uint64_t)w < mc_hi;
}
static int mc_marked(int64_t idx) { return (mc_live[idx >> 6] >> (idx & 63)) & 1; }
static void mc_set_range(int64_t idx, int64_t n)   /* bits idx .. idx + n - 1 */
{
	while (n > 0) {
		int64_t b = idx & 63, k = 64 - b < n ? 64 - b : n;
		mc_live[idx >> 6] |= (k == 64 ? ~0ULL : ((1ULL << k) - 1)) << b;
		idx += k;
		n -= k;
	}
}
static void mc_mark(int64_t w)
{
	int64_t *p, idx;
	if (!mc_in_heap(w))
		return;
	p = (int64_t *)(intptr_t)w;
	idx = p - mc_begin;
	if (mc_marked(idx))
		return;
	mc_set_range(idx, length_of(p[0]) + 1);
	if (mc_sp < MARK_STACK)
		mc_stack[mc_sp++] = p;
	else
		mc_overflow = 1;
}
static void mc_mark_fields(int64_t *p)
{
	int64_t h = p[0], len = length_of(h);
	if (kind_of(h) == 0 || kind_of(h) == 3)
		return;
	for (int64_t i = 0; i < len; i++)
		if (is_pointer_field(h, i))
			mc_mark(p[i + 1]);
}
static void mc_drain(void)
{
	while (mc_sp > 0)
		mc_mark_fields(mc_stack[--mc_sp]);
}
/* the next live word at or after idx (n when none) */
static int64_t mc_next_live(int64_t idx, int64_t n)
{
	while (idx < n) {
		uint64_t w = mc_live[idx >> 6] >> (idx & 63);
		if (w)
			return idx + __builtin_ctzll(w);
		idx = (idx | 63) + 1;
	}
	return n;
}
/* f(p) for each live object, lowest first */
#define MC_EACH_LIVE(p, n, body) MC_EACH_LIVE_FROM(p, 0, n, body)
#define MC_EACH_LIVE_FROM(p, from, n, body) \
	for (int64_t mc_i = mc_next_live(from, n); mc_i < n; mc_i = mc_next_live(mc_i, n)) \
		while (mc_i < n && mc_marked(mc_i)) { \
			int64_t *p = mc_begin + mc_i; \
			mc_i += length_of(p[0]) + 1; \
			body; \
		}
/* (CJI-3: a word's set bits without a call: neither the host's default build nor the board's core has
   a popcount instruction, and __builtin_popcountll became a library call in both) */
static int64_t mc_popcount(uint64_t x)
{
	x = x - ((x >> 1) & 0x5555555555555555ULL);
	x = (x & 0x3333333333333333ULL) + ((x >> 2) & 0x3333333333333333ULL);
	x = (x + (x >> 4)) & 0x0f0f0f0f0f0f0f0fULL;
	return (int64_t)((x * 0x0101010101010101ULL) >> 56);
}
/* (CJI-3: the dense prefix: the words below mc_dense are all live, so their objects stay where they are,
   and a pointer into them is its own new value) */
static int64_t mc_dense;
static int64_t mc_new_word(int64_t w)   /* a pointer's new value */
{
	int64_t idx;
	if (!mc_in_heap(w))
		return w;
	idx = (int64_t *)(intptr_t)w - mc_begin;
	if (idx < mc_dense)
		return w;
	return (int64_t)(intptr_t)(mc_begin + mc_before[idx >> 6]
		+ mc_popcount(mc_live[idx >> 6] & ((1ULL << (idx & 63)) - 1)));
}
static void mc_rewrite_fields(int64_t *p, int64_t (*f)(int64_t))
{
	int64_t h = p[0], len = length_of(h);
	if (kind_of(h) == 0 || kind_of(h) == 3)
		return;
	for (int64_t i = 0; i < len; i++)
		if (is_pointer_field(h, i))
			p[i + 1] = f(p[i + 1]);
}
static void mc_rewrite_roots(int64_t **rootstack_top, int64_t (*f)(int64_t))
{
	for (int64_t *r = rootstack_begin; r < (int64_t *)rootstack_top; r++)
		*r = f(*r);
	exc_value = f(exc_value);
	rt_entries[0] = f(rt_entries[0]);
	rt_entries[1] = f(rt_entries[1]);
	rt_exports[0] = f(rt_exports[0]);
	rt_exports[1] = f(rt_exports[1]);
}
static int64_t mc_delta;   /* (growing: the distance the block moved) */
static int64_t mc_shift(int64_t w) { return mc_in_heap(w) ? w + mc_delta : w; }
/* A compact heap's block, its live words at its start, made nw words long by realloc; when the block
   moved, every pointer into it (roots and fields) shifted by the distance. */
static int64_t *grow_in_place(int64_t **rootstack_top, int64_t *block, int64_t live, int64_t nw)
{
	volatile int64_t old_v = (int64_t)(intptr_t)block;   /* (the old block's address, as a number: it is freed) */
	int64_t *bigger = rt_realloc(block, (size_t)nw * 8), old = old_v;   /* (CJI-4: the world's allocator) */
	if (!bigger) {
		world_fatal("out of memory");
		fprintf(stderr, "out of memory\n");
		exit(3);
	}
	if ((int64_t)(intptr_t)bigger != old) {
		mc_lo = (uint64_t)old;
		mc_hi = (uint64_t)old + (uint64_t)live * 8;
		mc_delta = (int64_t)(intptr_t)bigger - old;
		mc_rewrite_roots(rootstack_top, mc_shift);
		for (int64_t *p = bigger; p < bigger + live; p += length_of(p[0]) + 1)
			mc_rewrite_fields(p, mc_shift);
	}
	return bigger;
}

static void compact_collect(int64_t **rootstack_top, int64_t bytes)
{
	int64_t n = free_ptr - fromspace_begin, nb = (n + 63) / 64, live = 0, words = fromspace_end - fromspace_begin, nw;
	mc_begin = fromspace_begin;
	mc_end = free_ptr;
	mc_lo = (uint64_t)(uintptr_t)mc_begin;
	mc_hi = (uint64_t)(uintptr_t)mc_end;
	/* (CJI-4: the side tables are the world's too, charged through rt_malloc like its heap) */
	mc_live = rt_malloc(((size_t)nb + 1) * sizeof *mc_live);
	mc_before = rt_malloc(((size_t)nb + 1) * sizeof *mc_before);
	if (!mc_live || !mc_before) {
		world_fatal("out of memory");
		fprintf(stderr, "out of memory\n");
		exit(3);
	}
	memset(mc_live, 0, ((size_t)nb + 1) * sizeof *mc_live);
	/* 1. mark */
	mc_sp = mc_overflow = 0;
	for (int64_t *r = rootstack_begin; r < (int64_t *)rootstack_top; r++)
		mc_mark(*r);
	mc_mark(exc_value);
	mc_mark(rt_entries[0]);
	mc_mark(rt_entries[1]);
	mc_mark(rt_exports[0]);
	mc_mark(rt_exports[1]);
	mc_drain();
	while (mc_overflow) {   /* (the stack overflowed: the marked objects again, for unmarked children) */
		mc_overflow = 0;
		rt_mark_rescans++;
		MC_EACH_LIVE(p, n, { mc_mark_fields(p); mc_drain(); });
	}
	/* 2. count */
	for (int64_t b = 0; b < nb; b++) {
		mc_before[b] = (uint32_t)live;
		live += mc_popcount(mc_live[b]);
	}
	/* the dense prefix: the live words from the start up to the first dead one */
	{
		int64_t b = 0;
		while (b < nb && mc_live[b] == ~0ULL)
			b++;
		mc_dense = b < nb ? 64 * b + (int64_t)__builtin_ctzll(~mc_live[b]) : n;
		if (mc_dense > n)
			mc_dense = n;
	}
	/* 3. rewrite the pointers (none if nothing moves), 4. slide (only what lies above the prefix) */
	if (mc_dense < n) {
		mc_rewrite_roots(rootstack_top, mc_new_word);
		MC_EACH_LIVE(p, n, mc_rewrite_fields(p, mc_new_word));
	}
	MC_EACH_LIVE_FROM(p, mc_dense, n, {
		int64_t *to = (int64_t *)(intptr_t)mc_new_word((int64_t)(intptr_t)p);
		if (to != p)
			memmove(to, p, (size_t)(length_of(p[0]) + 1) * 8);
	});
	rt_free(mc_live);
	rt_free(mc_before);
	mc_live = NULL;
	mc_before = NULL;
	note_live(live);
	rt_copied_bytes += live * 8;
	free_ptr = fromspace_begin + live;
	if ((nw = heap_words_for(live, bytes, words)) != words) {   /* grow: the block moved (realloc) */
		fromspace_begin = grow_in_place(rootstack_top, fromspace_begin, live, nw);
		free_ptr = fromspace_begin + live;
		words = nw;
	}
	fromspace_end = fromspace_begin + words;
}

/* (CJI-3, the hybrid collector, rt_gc_compact 2) Does a second space as large as the heap fit in the memory
   the heap may use: rt_gc_memory if the embedder set it, else the cap (-H)? Then this collection copies
   (one pass, the cheaper); else it compacts. With neither set, it always copies: the host and a roomy
   board pay nothing for the compactor, a tight board still fits. The growth policy is one for both. */
static int copy_fits(void)
{
	int64_t limit = rt_gc_memory ? rt_gc_memory : rt_heap_cap;
	return !limit || 2 * (fromspace_end - fromspace_begin) * 8 <= limit;
}
int64_t rt_hybrid_compactions;   /* (statistics: the hybrid collector's collections that compacted) */

/* Called by compiled code when an allocation of `bytes` would not fit. */
void rt_collect(int64_t **rootstack_top, int64_t bytes)
{
	stress_restore();
	if (rt_gc_compact == 1 || (rt_gc_compact == 2 && !copy_fits())) {
		rt_hybrid_compactions += rt_gc_compact == 2;
		compact_collect(rootstack_top, bytes);
	}
	else
		copy_collect(rootstack_top, bytes);
	stress_lower(bytes);
}

/* ---- chapter 27: the heap after main, as data ---------------------------------------------
 * A world's main only builds things: the runtime's objects, the world's definition, the two
 * entries. rt_snapshot copies everything the entries reach into a new block, as a collection
 * would, and turns every pointer into the block into its byte offset from the block's start,
 * marked in *map (one bit per word). A pointer that leaves the heap, to a static string, shape
 * or closure, or to a function's code (a closure's word 1, which is no pointer field), is
 * handed to `outside` with its word's index and role: 0 a pointer field, 1 a record's shape,
 * 2 a closure's code. outside returns 0 when the build can name it, -1 when it cannot, and
 * then there is no snapshot. Returns the block's length in words, or -1. The heap is left
 * forwarded: nothing may run after it. */
static int is_pointer(int64_t w);
int64_t rt_snapshot(int64_t **image, uint64_t **map, int64_t entries[2], int (*outside)(int64_t at, int64_t v, int role))
{
	int64_t words = fromspace_end - fromspace_begin, *to, *end, *scan;
	uint64_t *bits;
	if (exc_value || !rt_entries[0] || !rt_entries[1] || (int64_t *)rootstack_begin == NULL)
		return -1;
	rt_exports[0] = rt_exports[1] = 0;   /* (CJI-3: only the start reads them) */
	to = malloc((size_t)words * 8);
	if (!to)
		return -1;
	end = cheney((int64_t **)rootstack_begin, fromspace_begin, fromspace_end, to);
	bits = calloc((size_t)(end - to + 63) / 64 + 1, 8);
	if (!bits)
		return -1;
	for (scan = to; scan < end; ) {
		int64_t h = scan[0], len = length_of(h);
		if (kind_of(h) == 2 && len >= 1 && !((h >> 16) & 1)) {
			int64_t tag = (h >> 51) & 3;
			if ((tag == 2 || tag == 0) && outside(scan + 1 - to, scan[1], tag == 2 ? 1 : 2) < 0)
				return -1;
		}
		for (int64_t i = 0; i < len; i++) {
			int64_t v = scan[i + 1], at = scan + i + 1 - to;
			if (kind_of(h) == 3 || !is_pointer_field(h, i) || !is_pointer(v))
				continue;
			if ((int64_t *)v >= to && (int64_t *)v < end) {
				scan[i + 1] = (v - (int64_t)to);
				bits[at / 64] |= 1ULL << (at % 64);
			} else if (outside(at, v, 0) < 0)
				return -1;
		}
		scan += len + 1;
	}
	entries[0] = rt_entries[0] - (int64_t)to;
	entries[1] = rt_entries[1] - (int64_t)to;
	*image = to;
	*map = bits;
	return end - to;
}

/* The other half: snap is [words, entry 0, entry 1, the block's words, its map]. The block
 * becomes the start of the heap, its offsets addresses again, and the entries the runtime's. */
void rt_load_snapshot(const int64_t *snap)
{
	int64_t n, have;
	stress_restore();
	n = snap[0], have = fromspace_end - fromspace_begin;
	const int64_t *img = snap + 3;
	const uint64_t *bits = (const uint64_t *)(img + n);
	if (have < 2 * n) {   /* room for the image and as much again */
		while (have < 2 * n)
			have *= 2;
		rt_free(fromspace_begin);
		fromspace_begin = alloc_space(have * 8);
		fromspace_end = fromspace_begin + have;
	}
	memcpy(fromspace_begin, img, (size_t)n * 8);
	for (int64_t i = 0; i < n; i++)
		if ((bits[i / 64] >> (i % 64)) & 1)
			fromspace_begin[i] += (int64_t)fromspace_begin;
	free_ptr = fromspace_begin + n;
	rt_entries[0] = (int64_t)fromspace_begin + snap[1];
	rt_entries[1] = (int64_t)fromspace_begin + snap[2];
	rt_epoch_base += 1LL << 32;   /* chapter 31: every object has moved since the snapshot was taken */
	stress_lower(0);
}

/* chapter 29: 64-bit operations a 32-bit processor has no instruction for, which slas for rv32 calls
   (the firmware's compiler makes them from its own instructions) */
int64_t rt_i64_mul(int64_t a, int64_t b) { return (int64_t)((uint64_t)a * (uint64_t)b); }
int64_t rt_i64_shl(int64_t a, int64_t b) { return (int64_t)((uint64_t)a << (b & 63)); }
int64_t rt_i64_shr(int64_t a, int64_t b) { return (int64_t)((uint64_t)a >> (b & 63)); }
int64_t rt_i64_sar(int64_t a, int64_t b) { return a >> (b & 63); }

void rt_print_int(int64_t v)
{
	printf("%lld\n", (long long)v);
}

void rt_print_bool(int64_t v)
{
	puts(v ? "true" : "false");
}

/* An array index outside the array. JavaScript would read undefined or grow the array;
 * both are outside the subset, so the program stops. */
/* CJI-4: a frame pushed past the root stack's end (the rv32 backend checks every push; chapter 30) */
void rt_rootstack_overflow(void)
{
	world_fatal("root stack overflow");
	fflush(stdout);
	fprintf(stderr, "root stack overflow\n");
	exit(2);
}

void rt_index_error(void)
{
	world_fatal("index out of range");
	fflush(stdout);
	fprintf(stderr, "index out of range\n");
	exit(2);
}

/* ---- chapter 9: dynamic values -------------------------------------------------------
 *
 * A value of type Any is one word, NaN-boxed the way JavaScriptCore does it:
 *
 *   a pointer           the address itself (the top 16 bits are 0, and it is 4096 or more)
 *   a number            the bits of its double plus 2^49 (the top 16 bits are 2 or more)
 *   false, true         6, 7
 *   null, undefined     2, 10
 *
 * A NaN is stored as the canonical one, so that no double plus 2^49 wraps around. */

#define ANY_NULL 2
#define ANY_FALSE 6
#define ANY_TRUE 7
#define ANY_UNDEFINED 10
#define DOUBLE_OFFSET (1ULL << 49)

static int is_number(int64_t w) { return (uint64_t)w >= DOUBLE_OFFSET; }
static int is_pointer(int64_t w) { return (uint64_t)w >= 4096 && (uint64_t)w < (1ULL << 48); }

static double to_double(int64_t w)
{
	uint64_t bits = (uint64_t)w - DOUBLE_OFFSET;
	double d;
	memcpy(&d, &bits, 8);
	return d;
}

static int64_t from_double(double d)
{
	uint64_t bits;
	memcpy(&bits, &d, 8);
	if ((bits & 0x7fffffffffffffffULL) > 0x7ff0000000000000ULL)   /* (CJI-3: a NaN, told by its bits) */
		bits = 0x7ff8000000000000ULL;
	return (int64_t)(bits + DOUBLE_OFFSET);
}

/* ---- CJI-3: whole numbers in integer arithmetic ------------------------------------------------
 * The board's processor (RV32IMAFC) has no double-precision unit: every double operation in this
 * file is a call of a soft-float helper there. A number that is a whole number of magnitude below
 * 2^53 (a compiler's indices, lengths and counters) is recognised from its bits, and the
 * arithmetic, comparisons and conversions below are done on integers for it; anything else takes
 * the double path as before, so every answer is the same. -0 is a whole number (0) where JavaScript
 * treats it as 0 (an index, a comparison, ToInt32), and not where it differs (an arithmetic result:
 * 0 * -1 is -0). */
#define MANTISSA_BITS 0xfffffffffffffULL
#define NEG_ZERO_BITS 0x8000000000000000ULL
#define SAFE_INT 9007199254740991LL
/* The double with bits b, if it is a whole number below 2^53 in magnitude (-0 as 0): 1, *v. */
static int whole_bits(uint64_t b, int64_t *v)
{
	uint64_t e = (b >> 52) & 0x7ff, m;
	int sh;
	if ((b << 1) == 0) { *v = 0; return 1; }
	if (e < 1023 || e > 1023 + 52)
		return 0;
	sh = 52 - (int)(e - 1023);
	m = (b & MANTISSA_BITS) | (1ULL << 52);
	if (sh > 0 && (m & ((1ULL << sh) - 1)))
		return 0;
	m >>= sh;
	*v = b >> 63 ? -(int64_t)m : (int64_t)m;
	return 1;
}
/* a dynamic value that is a whole number (-0 as 0) */
static int whole_word(int64_t w, int64_t *v) { return (uint64_t)w >= DOUBLE_OFFSET && whole_bits((uint64_t)w - DOUBLE_OFFSET, v); }
/* the same, -0 not taken (an operand of arithmetic) */
static int exact_word(int64_t w, int64_t *v)
{
	return (uint64_t)w >= DOUBLE_OFFSET && (uint64_t)w - DOUBLE_OFFSET != NEG_ZERO_BITS && whole_bits((uint64_t)w - DOUBLE_OFFSET, v);
}
/* the bits of the double that is v, |v| <= 2^53 - 1, without a conversion */
static uint64_t whole_to_bits(int64_t v)
{
	uint64_t a, e;
	if (v == 0)
		return 0;
	a = v < 0 ? (uint64_t)0 - (uint64_t)v : (uint64_t)v;
	e = 63 - (uint64_t)__builtin_clzll(a);
	return (v < 0 ? NEG_ZERO_BITS : 0) | (e + 1023) << 52 | ((a << (52 - e)) & MANTISSA_BITS);
}
static int64_t box_whole(int64_t v) { return (int64_t)(whole_to_bits(v) + DOUBLE_OFFSET); }
/* Two doubles' order from their bits alone (any number, whole or not, the infinities too): -1, 0
   or 1, or 2 when either is NaN. A double's bits read as sign and magnitude: a key that orders as
   unsigned integers is the bits with the sign bit set for a positive number, all bits flipped for a
   negative one; -0 is +0 first. */
static int bits_nan(uint64_t b) { return (b & 0x7fffffffffffffffULL) > 0x7ff0000000000000ULL; }
static uint64_t order_key(uint64_t b)
{
	if (b == NEG_ZERO_BITS)
		b = 0;
	return b >> 63 ? ~b : b | NEG_ZERO_BITS;
}
static int order_bits(uint64_t a, uint64_t b)
{
	uint64_t x, y;
	if (bits_nan(a) || bits_nan(b))
		return 2;
	x = order_key(a);
	y = order_key(b);
	return x < y ? -1 : x > y;
}
static int safe_int(int64_t v) { return v >= -SAFE_INT && v <= SAFE_INT; }

/* A run-time error of the subset: the message, and exit status 2, as rt_index_error. */
static void type_error(const char *msg)
{
	if (rt_fatal)
		rt_fatal(msg);
	fflush(stdout);
	fprintf(stderr, "%s\n", msg);
	exit(2);
}

/* JavaScript's ToNumber, for the values of the subset. An array or function would become
 * a string first, and strings are not in the subset yet. */
static int is_string(int64_t w);              /* chapter 13 */
static double string_to_number(int64_t s);
static int64_t str_concat_values(int64_t a, int64_t b, int64_t *roots);
static int is_error(int64_t w);
static int64_t error_string(int64_t e, int64_t *roots);
static int64_t throw_error(const char *name, const char *message, int64_t *roots);
static int64_t throw_null_read(int64_t o, int64_t key);
static int str_equal(int64_t a, int64_t b);

static double to_number(int64_t w)
{
	if (is_number(w))
		return to_double(w);
	if (is_string(w))
		return string_to_number(w);
	switch (w) {
	case ANY_TRUE: return 1;
	case ANY_FALSE: case ANY_NULL: return 0;
	case ANY_UNDEFINED: return NAN;
	}
	type_error("an array or function used as a number is outside the subset");
	return 0;
}

/* chapter 13: + with a string operand is a concatenation, and allocates */
int64_t rt_any_add(int64_t a, int64_t b, int64_t *roots)
{
	int64_t x, y;
	if (exact_word(a, &x) && exact_word(b, &y) && safe_int(x + y))   /* (CJI-3: whole numbers) */
		return box_whole(x + y);
	if (is_string(a) || is_string(b))
		return str_concat_values(a, b, roots);
	return from_double(to_number(a) + to_number(b));
}
int64_t rt_any_sub(int64_t a, int64_t b)
{
	int64_t x, y;
	if (exact_word(a, &x) && exact_word(b, &y) && safe_int(x - y))
		return box_whole(x - y);
	return from_double(to_number(a) - to_number(b));
}
int64_t rt_any_mul(int64_t a, int64_t b)
{
	int64_t x, y, p;
	/* (a zero product of a negative operand is -0) */
	if (exact_word(a, &x) && exact_word(b, &y) && !__builtin_mul_overflow(x, y, &p) && safe_int(p) && (p != 0 || (x >= 0 && y >= 0)))
		return box_whole(p);
	return from_double(to_number(a) * to_number(b));
}
int64_t rt_any_div(int64_t a, int64_t b)
{
	int64_t x, y;
	/* (an exact quotient; 0 divided by a negative number is -0) */
	if (exact_word(a, &x) && exact_word(b, &y) && y != 0 && x % y == 0 && (x != 0 || y > 0))
		return box_whole(x / y);
	return from_double(to_number(a) / to_number(b));
}
int64_t rt_any_neg(int64_t a)
{
	int64_t x;
	if (exact_word(a, &x) && x != 0)
		return box_whole(-x);
	return from_double(-to_number(a));
}
/* (chapter 22: two strings compare by their code units, as JavaScript's relational
   comparison does; anything else as numbers) */
int64_t rt_str_cmp(int64_t a, int64_t b);
/* (CJI-3: two numbers compare by their bits; NaN is unordered, every comparison false) */
#define WHOLE_CMP(op) if (is_number(a) && is_number(b)) { int c = order_bits((uint64_t)a - DOUBLE_OFFSET, (uint64_t)b - DOUBLE_OFFSET); return c != 2 && c op 0; }
int64_t rt_any_lt(int64_t a, int64_t b) { WHOLE_CMP(<) return is_string(a) && is_string(b) ? rt_str_cmp(a, b) < 0 : to_number(a) < to_number(b); }
int64_t rt_any_le(int64_t a, int64_t b) { WHOLE_CMP(<=) return is_string(a) && is_string(b) ? rt_str_cmp(a, b) <= 0 : to_number(a) <= to_number(b); }
int64_t rt_any_gt(int64_t a, int64_t b) { WHOLE_CMP(>) return is_string(a) && is_string(b) ? rt_str_cmp(a, b) > 0 : to_number(a) > to_number(b); }
int64_t rt_any_ge(int64_t a, int64_t b) { WHOLE_CMP(>=) return is_string(a) && is_string(b) ? rt_str_cmp(a, b) >= 0 : to_number(a) >= to_number(b); }

/* ===: numbers by value (so NaN is not NaN, and 0 is -0), everything else by its word. */
int64_t rt_any_eq(int64_t a, int64_t b)
{
	if (is_number(a) && is_number(b))   /* (CJI-3: by the bits: -0 is 0, NaN is nothing) */
		return order_bits((uint64_t)a - DOUBLE_OFFSET, (uint64_t)b - DOUBLE_OFFSET) == 0;
	if (is_string(a) && is_string(b))
		return str_equal(a, b);
	return a == b;
}

int64_t rt_any_truthy(int64_t a)
{
	if (is_string(a))
		return ((int64_t *)a)[1] != 0;
	if (is_number(a)) {   /* (CJI-3: not ±0 and not NaN, told by the bits) */
		uint64_t b = ((uint64_t)a - DOUBLE_OFFSET) & 0x7fffffffffffffffULL;
		return b != 0 && b <= 0x7ff0000000000000ULL;
	}
	return a == ANY_TRUE || is_pointer(a);
}

/* typeof, as 0 undefined, 1 boolean, 2 number, 3 object, 4 function (dynamic.js's TYPEOF). */
int64_t rt_any_typeof(int64_t a)
{
	if (is_number(a)) return 2;
	if (is_string(a)) return 5;                                                 /* chapter 13 */
	if (is_pointer(a) && kind_of(((int64_t *)a)[0]) == 2 && (((int64_t *)a)[0] >> 52 & 1)) return 3;   /* a record, an array */
	if (a == ANY_TRUE || a == ANY_FALSE) return 1;
	if (a == ANY_UNDEFINED) return 0;
	if (is_pointer(a) && kind_of(((int64_t *)a)[0]) == 2) return 4;
	return 3;
}

int64_t rt_any_from_int(int64_t n) { return safe_int(n) ? box_whole(n) : from_double((double)n); }

int64_t rt_any_to_int(int64_t a)
{
	int64_t v;
	double d;
	if (whole_word(a, &v))   /* (CJI-3) */
		return v;
	d = is_number(a) ? to_double(a) : NAN;
	if (!(d == floor(d) && fabs(d) <= 9007199254740991.0))
		type_error("type error: expected an integer");
	return (int64_t)d;
}

int64_t rt_any_to_bool(int64_t a)
{
	if (a != ANY_TRUE && a != ANY_FALSE)
		type_error("type error: expected a boolean");
	return a == ANY_TRUE;
}

int64_t rt_any_to_array(int64_t a)
{
	if (!is_array(a))
		type_error("type error: expected an array");
	return a;
}

int64_t rt_any_to_function(int64_t a, int64_t arity)
{
	if (!is_pointer(a) || kind_of(((int64_t *)a)[0]) != 2 || (((int64_t *)a)[0] >> 52 & 1) || arity_of(((int64_t *)a)[0]) != arity) {
		char msg[80];
		snprintf(msg, sizeof msg, "type error: expected a function of %lld argument%s", (long long)arity,
			arity == 1 ? "" : "s");
		type_error(msg);
	}
	return a;
}

/* A number as JavaScript prints it (Number.prototype.toString, and -0 as console.log
 * shows it): the shortest digits that read back as the same double, then a decimal point,
 * zeros or an exponent depending on where the point falls. */
static void format_number(double d, char *out)
{
	char tmp[40], digits[20];
	int k = 0, n, e10, prec;
	uint64_t b;
	int64_t v;
	memcpy(&b, &d, 8);
	if (b != NEG_ZERO_BITS && whole_bits(b, &v)) {   /* (CJI-3: a whole number: its digits, no double printing) */
		snprintf(out, 24, "%lld", (long long)v);
		return;
	}
	if (d != d) { strcpy(out, "NaN"); return; }
	if (d == 0) { strcpy(out, signbit(d) ? "-0" : "0"); return; }
	if (d < 0) { *out++ = '-'; d = -d; }
	if (isinf(d)) { strcpy(out, "Infinity"); return; }
	for (prec = 1; prec <= 17; prec++) {
		snprintf(tmp, sizeof tmp, "%.*e", prec - 1, d);
		if (strtod(tmp, NULL) == d)
			break;
	}
	for (char *p = tmp; *p && *p != 'e'; p++)
		if (*p != '.')
			digits[k++] = *p;
	while (k > 1 && digits[k - 1] == '0')
		k--;
	digits[k] = 0;
	e10 = atoi(strchr(tmp, 'e') + 1);
	n = e10 + 1;                  /* the value is 0.digits times 10^n */
	if (k <= n && n <= 21) {
		sprintf(out, "%s%0*d", digits, n - k, 0);
		if (n == k) out[k] = 0;
	} else if (0 < n && n <= 21) {
		sprintf(out, "%.*s.%s", n, digits, digits + n);
	} else if (-6 < n && n <= 0) {
		sprintf(out, "0.%0*d%s", -n, 0, digits);
		if (n == 0) sprintf(out, "0.%s", digits);
	} else {
		sprintf(out, "%c%s%s%se%c%d", digits[0], k > 1 ? "." : "", digits + 1, "", n - 1 >= 0 ? '+' : '-', abs(n - 1));
	}
}

/* A dynamic value as console.log prints it, followed by `end` (a newline, or a space when
 * more values of the same console.log follow: chapter 10). */
void rt_put_units(int64_t s);
static void any_out(int64_t a, const char *end)
{
	char buf[64];
	if (is_number(a)) {
		format_number(to_double(a), buf);
		fputs(buf, stdout);
	} else if (a == ANY_TRUE || a == ANY_FALSE) {
		fputs(a == ANY_TRUE ? "true" : "false", stdout);
	} else if (a == ANY_NULL || a == ANY_UNDEFINED) {
		fputs(a == ANY_NULL ? "null" : "undefined", stdout);
	} else if (is_string(a)) {   /* chapter 13 */
		rt_put_units(a);
	} else {
		type_error("console.log of an array or function is outside the subset");
	}
	fputs(end, stdout);
}

void rt_any_print(int64_t a) { any_out(a, "\n"); }

/* ---- chapter 10: numbers ----------------------------------------------------------------
 * A Number is a double, kept in a word as its 64 bits (no offset: the type says it is a
 * double, so it needs no box). */

static double bits_double(int64_t w) { double d; memcpy(&d, &w, sizeof d); return d; }
static int64_t double_bits(double d) { int64_t w; memcpy(&w, &d, sizeof w); return w; }

void rt_any_put(int64_t a) { any_out(a, " "); }
void rt_put_int(int64_t v) { printf("%lld ", (long long)v); }
void rt_put_bool(int64_t v) { fputs(v ? "true " : "false ", stdout); }

void rt_print_num(int64_t bits)
{
	char buf[64];
	format_number(bits_double(bits), buf);
	puts(buf);
}

void rt_put_num(int64_t bits)
{
	char buf[64];
	format_number(bits_double(bits), buf);
	printf("%s ", buf);
}

/* % of two Ints: C's % truncates as JavaScript's does. x % 0 is NaN in JavaScript, which an
 * Int cannot hold: outside the subset. */
int64_t rt_int_mod(int64_t a, int64_t b)
{
	if (b == 0)
		type_error("x % 0 is NaN, which is outside the integer subset");
	return a % b;
}

int64_t rt_num_mod(int64_t a, int64_t b)
{
	int64_t x, y;
	/* (CJI-3: whole numbers; a zero remainder of a negative dividend is -0) */
	if ((uint64_t)a != NEG_ZERO_BITS && whole_bits((uint64_t)a, &x) && whole_bits((uint64_t)b, &y) && y != 0 && (x % y != 0 || x >= 0))
		return (int64_t)whole_to_bits(x % y);
	return double_bits(fmod(bits_double(a), bits_double(b)));
}

/* JavaScript's ToInt32: the integer part, modulo 2^32, as a signed 32-bit integer. */
static int64_t to_int32(double d)
{
	double m;
	if (d > -2147483649.0 && d < 2147483648.0)   /* (CJI-3, lane 6: in range, ToInt32 is truncation, */
		return (int64_t)d;                       /* without fmod; NaN fails both tests) */
	if (!isfinite(d))
		return 0;
	m = fmod(trunc(d), 4294967296.0);
	if (m < 0)
		m += 4294967296.0;
	return m >= 2147483648.0 ? (int64_t)(m - 4294967296.0) : (int64_t)m;
}

int64_t rt_num_to_int32(int64_t bits)
{
	int64_t v;
	if (whole_bits((uint64_t)bits, &v))   /* (CJI-3: ToInt32 of a whole number is its low 32 bits) */
		return (int32_t)(uint32_t)(uint64_t)v;
	return to_int32(bits_double(bits));
}

/* A double used as an array index must be a safe integer (-0 is 0). */
int64_t rt_num_to_int(int64_t bits)
{
	int64_t v;
	double d;
	if (whole_bits((uint64_t)bits, &v))   /* (CJI-3) */
		return v;
	d = bits_double(bits);
	if (!(d == trunc(d) && fabs(d) <= 9007199254740991.0))
		type_error("type error: expected an integer");
	return (int64_t)d;
}
int64_t rt_any_to_int32(int64_t a)
{
	int64_t v;
	if (whole_word(a, &v))   /* (CJI-3) */
		return (int32_t)(uint32_t)(uint64_t)v;
	return to_int32(to_number(a));
}
int64_t rt_any_mod(int64_t a, int64_t b)
{
	int64_t x, y;
	if (exact_word(a, &x) && exact_word(b, &y) && y != 0 && (x % y != 0 || x >= 0))   /* (CJI-3) */
		return box_whole(x % y);
	return from_double(fmod(to_number(a), to_number(b)));
}

int64_t rt_any_to_number(int64_t a)
{
	if (!is_number(a))
		type_error("type error: expected a number");
	return (int64_t)((uint64_t)a - DOUBLE_OFFSET);
}

/* JavaScript's **: C's pow, except that JavaScript gives NaN for a NaN exponent and for
 * 1 or -1 to an infinite power, where pow gives 1. */
static double js_pow(double x, double y)
{
	if (y != y || ((x == 1 || x == -1) && isinf(y)))
		return NAN;
	return pow(x, y);
}

int64_t rt_num_pow(int64_t a, int64_t b) { return double_bits(js_pow(bits_double(a), bits_double(b))); }
int64_t rt_any_pow(int64_t a, int64_t b) { return from_double(js_pow(to_number(a), to_number(b))); }

/* ==: null and undefined equal each other and nothing else; numbers and booleans compare
 * as numbers; an array or function equals only itself. Comparing one with a number or a
 * boolean, where JavaScript would turn it into a string first, is outside the subset. */
static int nullish(int64_t w) { return w == ANY_NULL || w == ANY_UNDEFINED; }
static int primitive(int64_t w) { return is_number(w) || w == ANY_TRUE || w == ANY_FALSE || is_string(w); }

int64_t rt_any_loose_eq(int64_t a, int64_t b)
{
	if (nullish(a) || nullish(b))
		return nullish(a) && nullish(b);
	if (is_string(a) && is_string(b))
		return str_equal(a, b);
	if (primitive(a) && primitive(b))
		return to_number(a) == to_number(b);
	if (primitive(a) || primitive(b))
		type_error("== between an array or function and a number or boolean is outside the subset");
	return a == b;
}

/* ---- chapter 10: Math ------------------------------------------------------------------
 * Each takes and gives a double's bits (or, for the int_ ones and clz32 and imul, an
 * integer). C's functions mean the same as JavaScript's except where noted. */

#define MATH1(name, expr) int64_t rt_##name(int64_t a) { double x = bits_double(a); return double_bits(expr); }
#define MATH2(name, expr) int64_t rt_##name(int64_t a, int64_t b) { double x = bits_double(a), y = bits_double(b); return double_bits(expr); }

/* JavaScript rounds halves up, towards +Infinity, and keeps the sign of a zero result */
static double js_round(double x)
{
	double r = floor(x);
	if (x != x || isinf(x))
		return x;
	if (x - r >= 0.5)
		r += 1;
	if (r == 0 && (x < 0 || signbit(x)))
		return -0.0;
	return r;
}

/* NaN wins in JavaScript's min and max, and -0 is less than 0 */
static double js_min(double x, double y)
{
	if (x != x || y != y) return NAN;
	if (x == 0 && y == 0) return signbit(x) ? x : y;
	return x < y ? x : y;
}
static double js_max(double x, double y)
{
	if (x != x || y != y) return NAN;
	if (x == 0 && y == 0) return signbit(x) ? y : x;
	return x > y ? x : y;
}
static double js_sign(double x) { return x != x || x == 0 ? x : x > 0 ? 1 : -1; }

/* (CJI-3: floor, ceil, round and trunc of a whole number are the number, -0 included; trunc of any
   finite number drops its fraction's bits, and floor and ceil of a fractional one step from that) */
static uint64_t trunc_bits(uint64_t b)
{
	uint64_t e = (b >> 52) & 0x7ff;
	if (e >= 1023 + 52)
		return b;   /* (whole already, or infinite, or NaN) */
	if (e < 1023)
		return b & NEG_ZERO_BITS;   /* (a zero of the same sign) */
	return b & ~((1ULL << (52 - (e - 1023))) - 1);
}
static int64_t step_bits(uint64_t b, int up)   /* floor (up 0) or ceil (up 1) of a finite fractional b */
{
	uint64_t t = trunc_bits(b);
	int64_t v;
	if (t == b || (up ? b >> 63 : !(b >> 63)))
		return (int64_t)t;   /* (toward zero is the answer: -0 for ceil of -0.5) */
	whole_bits(t, &v);
	return (int64_t)whole_to_bits(up ? v + 1 : v - 1);
}
#define MATH_WHOLE(name, expr) int64_t rt_##name(int64_t a) { int64_t v; double x; \
	if (whole_bits((uint64_t)a, &v)) { return a; } \
	x = bits_double(a); return double_bits(expr); }
#define FINITE(a) ((((uint64_t)(a) >> 52) & 0x7ff) != 0x7ff)
int64_t rt_math_floor(int64_t a) { if (FINITE(a)) return step_bits((uint64_t)a, 0); return double_bits(floor(bits_double(a))); }
int64_t rt_math_ceil(int64_t a) { if (FINITE(a)) return step_bits((uint64_t)a, 1); return double_bits(ceil(bits_double(a))); }
MATH_WHOLE(math_round, js_round(x))
int64_t rt_math_trunc(int64_t a) { return (int64_t)trunc_bits((uint64_t)a); }
MATH1(math_abs, fabs(x))
MATH1(math_sign, js_sign(x))
MATH1(math_sqrt, sqrt(x))
/* glibc's cbrt is not correctly rounded (cbrt(27) is 3.0000000000000004). V8's is FreeBSD's
 * (fdlibm's) s_cbrt.c, which this is, so that the two print the same digits. */
static double js_cbrt(double x)
{
	static const uint32_t B1 = 715094163, B2 = 696219795;
	static const double P0 = 1.87595182427177009643, P1 = -1.88497979543377169875,
		P2 = 1.621429720105354466140, P3 = -0.758397934778766047437, P4 = 0.145996192886612446982;
	uint64_t bits, tb;
	uint32_t hx, sign, high;
	double r, s, t, w;
	memcpy(&bits, &x, 8);
	hx = (uint32_t)(bits >> 32);
	sign = hx & 0x80000000u;
	hx &= 0x7fffffffu;
	if (hx >= 0x7ff00000u)
		return x + x;
	if (hx < 0x00100000u) {            /* zero or subnormal */
		if ((hx | (uint32_t)bits) == 0)
			return x;
		tb = (uint64_t)0x43500000u << 32;   /* 2^54 */
		memcpy(&t, &tb, 8);
		t *= x;
		memcpy(&tb, &t, 8);
		high = (uint32_t)(tb >> 32) & 0x7fffffffu;
		tb = (uint64_t)(sign | (high / 3 + B2)) << 32;
	} else {
		tb = (uint64_t)(sign | (hx / 3 + B1)) << 32;
	}
	memcpy(&t, &tb, 8);
	r = (t * t) * (t / x);
	t = t * ((P0 + r * (P1 + r * P2)) + ((r * r) * r) * (P3 + r * P4));
	memcpy(&tb, &t, 8);
	tb = (tb + 0x80000000u) & 0xffffffffc0000000ULL;
	memcpy(&t, &tb, 8);
	s = t * t;
	r = x / s;
	w = t + t;
	r = (r - t) / (w + r);
	return t + t * r;
}
MATH1(math_cbrt, js_cbrt(x))
MATH1(math_exp, exp(x))
MATH1(math_log, log(x))
MATH1(math_log2, log2(x))
/* Chapter 21: the host's clock, and the local time zone's offset from UTC at a time, in ms
   (glibc's localtime_r with the TZ the program was started with) */
/* (chapter 23: or the virtual clock a world harness set, Math.$clock(t)) */
static double virtual_clock = NAN;
int64_t rt_date_now(void)
{
	struct timespec ts;
#ifdef ESP_PLATFORM
	if (rt_kernel_call) {
		int64_t ms = rt_kernel_call(22, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, NULL, 0);
		if (ms >= 0) return double_bits((double)ms);
	}
#endif
	if (!isnan(virtual_clock)) return double_bits(virtual_clock);
	clock_gettime(CLOCK_REALTIME, &ts);
	return double_bits((double)ts.tv_sec * 1000 + (double)(ts.tv_nsec / 1000000));
}
static double local_offset(double t)
{
	time_t s;
	struct tm tm;
	if (!isfinite(t)) return NAN;
	s = (time_t)floor(t / 1000);
	if (!localtime_r(&s, &tm)) return NAN;
#ifdef ESP_PLATFORM
	struct tm utc;
	if (!gmtime_r(&s, &utc)) return NAN;
	/* The two civil dates are at most a day apart, including at New Year. */
	int days = tm.tm_year == utc.tm_year ? tm.tm_yday - utc.tm_yday :
		(tm.tm_year > utc.tm_year ? 1 : -1);
	return 1000.0 * (days * 86400 + (tm.tm_hour - utc.tm_hour) * 3600 +
		(tm.tm_min - utc.tm_min) * 60 + tm.tm_sec - utc.tm_sec);
#else
	return (double)tm.tm_gmtoff * 1000;
#endif
}
MATH1(date_tz, local_offset(x))
static double set_clock(double t) { virtual_clock = t; return t; }
MATH1(date_clock, set_clock(x))   /* chapter 23 */
MATH1(math_sinh, sinh(x))   /* chapter 21 */
MATH1(math_cosh, cosh(x))
MATH1(math_tanh, tanh(x))
MATH1(math_asinh, asinh(x))
MATH1(math_acosh, acosh(x))
MATH1(math_atanh, atanh(x))
MATH1(math_log10, log10(x))
MATH1(math_sin, sin(x))
MATH1(math_cos, cos(x))
MATH1(math_tan, tan(x))
MATH1(math_atan, atan(x))
MATH1(math_asin, asin(x))
MATH1(math_acos, acos(x))
MATH1(math_fround, (double)(float)x)
MATH2(math_atan2, atan2(x, y))
MATH2(math_hypot, hypot(x, y))
/* (CJI-3: of two numbers, neither NaN, by their bits; two zeros (min(0, -0) is -0) take the double path) */
#define MINMAX(name, op, expr) int64_t rt_##name(int64_t a, int64_t b) { double x, y; \
	int c = order_bits((uint64_t)a, (uint64_t)b); \
	if (c != 2 && (c != 0 || a == b)) { return c op 0 ? a : b; } \
	x = bits_double(a); y = bits_double(b); return double_bits(expr); }
MINMAX(num_min, <=, js_min(x, y))
MINMAX(num_max, >=, js_max(x, y))

int64_t rt_int_abs(int64_t a) { return a < 0 ? -a : a; }
int64_t rt_int_sign(int64_t a) { return a > 0 ? 1 : a < 0 ? -1 : 0; }
int64_t rt_int_min(int64_t a, int64_t b) { return a < b ? a : b; }
int64_t rt_int_max(int64_t a, int64_t b) { return a > b ? a : b; }
int64_t rt_math_clz32(int64_t a) { uint32_t x = (uint32_t)a; return x == 0 ? 32 : __builtin_clz(x); }
int64_t rt_math_imul(int64_t a, int64_t b) { return (int32_t)((uint32_t)a * (uint32_t)b); }

/* ---- chapter 13: strings and records ---------------------------------------------------
 *
 * A string is an object of kind 3: its header, its number of UTF-16 code units, then the
 * units, four to a word (a uint16_t array). No word of it is a pointer. A string literal is
 * a static string, made once by slas outside the heap, which the collector leaves alone.
 *
 * A record is a kind-2 object with bit 52 of its header set: word 1 is its shape (a static
 * table: the number of fields, then a pointer to each name's string), and its fields
 * follow in the order of their names. Bit 0 of its mask is clear, so the collector does
 * not follow the shape.
 *
 * A function that allocates gets the root stack's top: when the space it needs is not
 * free, it writes its pointer arguments there, collects, and reads them back moved. */

#define RECORD_BIT (1LL << 52)

static int is_string(int64_t w) { return is_pointer(w) && kind_of(((int64_t *)w)[0]) == 3; }
static int is_record(int64_t w)
{
	return is_pointer(w) && kind_of(((int64_t *)w)[0]) == 2 && ((((int64_t *)w)[0] >> 51) & 3) == 2;
}
static int64_t slen(int64_t s) { return ((int64_t *)s)[1]; }
static uint16_t *units(int64_t s) { return (uint16_t *)(((int64_t *)s) + 2); }

/* Room for an object of `words` fields; the nkeep words of keep[] survive a collection. */
static int64_t *alloc_words(int64_t words, int64_t *roots, int64_t *keep, int nkeep)
{
	int64_t *p;
	if (free_ptr + words + 1 > fromspace_end) {
		for (int i = 0; i < nkeep; i++)
			roots[i] = keep[i];
		rt_collect((int64_t **)(roots + nkeep), 8 * (words + 1));
		for (int i = 0; i < nkeep; i++)
			keep[i] = roots[i];
	}
	p = free_ptr;
	free_ptr += words + 1;
	return p;
}

static int64_t string_words(int64_t n) { return 1 + (n + 3) / 4; }

/* A new string of n units (to be filled in by the caller). */
static int64_t *new_string(int64_t n, int64_t *roots, int64_t *keep, int nkeep)
{
	int64_t w = string_words(n), *p = alloc_words(w, roots, keep, nkeep);
	p[0] = w << 3 | 3 << 1 | 1;
	p[1] = n;
	p[w] = 0;   /* the last word's unused units */
	return p;
}

static int64_t string_of(const uint16_t *u, int64_t n, int64_t *roots)
{
	int64_t *p = new_string(n, roots, NULL, 0);
	memcpy(p + 2, u, (size_t)n * 2);
	return (int64_t)p;
}

static int64_t string_of_ascii(const char *s, int64_t *roots)
{
	int64_t n = (int64_t)strlen(s), *p = new_string(n, roots, NULL, 0);
	for (int64_t k = 0; k < n; k++)
		((uint16_t *)(p + 2))[k] = (uint16_t)(unsigned char)s[k];
	return (int64_t)p;
}

/* A static string, outside the heap: literals (slas) and the runtime's own words. */
int64_t rt_static_string(const uint16_t *u, int64_t n)
{
	int64_t w = string_words(n), *p = calloc((size_t)w + 1, 8);
	if (!p) { fprintf(stderr, "out of memory\n"); exit(3); }
	p[0] = w << 3 | 3 << 1 | 1;
	p[1] = n;
	memcpy(p + 2, u, (size_t)n * 2);
	return (int64_t)p;
}
static int64_t static_ascii(const char *s)
{
	uint16_t u[64];
	int64_t n = (int64_t)strlen(s);
	for (int64_t k = 0; k < n; k++)
		u[k] = (uint16_t)s[k];
	return rt_static_string(u, n);
}
static int64_t word_string(const char *s)   /* one static string per word, made on first use */
{
	static const char *names[16];
	static int64_t made[16];
	static int count;
	for (int i = 0; i < count; i++)
		if (!strcmp(names[i], s))
			return made[i];
	names[count] = s;
	made[count] = static_ascii(s);
	return made[count++];
}

static int str_equal(int64_t a, int64_t b)
{
	/* (CJI-3, lane 6: the same string first, then the lengths, then short strings unit by unit without a
	   call: the names a dynamic field access compares are mostly the same static literal, or of
	   another length) */
	int64_t n;
	if (a == b) return 1;
	n = slen(a);
	if (n != slen(b)) return 0;
	if (n <= 16) {
		const uint16_t *x = units(a), *y = units(b);
		for (int64_t k = 0; k < n; k++)
			if (x[k] != y[k]) return 0;
		return 1;
	}
	return !memcmp(units(a), units(b), (size_t)n * 2);
}
int64_t rt_str_eq(int64_t a, int64_t b) { return str_equal(a, b); }
int64_t rt_str_cmp(int64_t a, int64_t b)
{
	int64_t n = slen(a) < slen(b) ? slen(a) : slen(b);
	for (int64_t k = 0; k < n; k++)
		if (units(a)[k] != units(b)[k])
			return units(a)[k] < units(b)[k] ? -1 : 1;
	return slen(a) < slen(b) ? -1 : slen(a) > slen(b);
}

/* Printing: UTF-16 to UTF-8; a lone surrogate prints as U+FFFD, as Node writes it. */
static void put_code_point_to(FILE *f, uint32_t c)
{
	if (c < 0x80) fputc((int)c, f);
	else if (c < 0x800) { fputc(0xc0 | (c >> 6), f); fputc(0x80 | (c & 0x3f), f); }
	else if (c < 0x10000) { fputc(0xe0 | (c >> 12), f); fputc(0x80 | ((c >> 6) & 0x3f), f); fputc(0x80 | (c & 0x3f), f); }
	else { fputc(0xf0 | (c >> 18), f); fputc(0x80 | ((c >> 12) & 0x3f), f); fputc(0x80 | ((c >> 6) & 0x3f), f); fputc(0x80 | (c & 0x3f), f); }
}
static void put_units_to(FILE *f, int64_t s);
void rt_put_units(int64_t s) { put_units_to(stdout, s); }
static void put_units_to(FILE *f, int64_t s)
{
	const uint16_t *u = units(s);
	for (int64_t k = 0, n = slen(s); k < n; k++) {
		uint32_t c = u[k];
		if (c >= 0xd800 && c < 0xdc00 && k + 1 < n && u[k + 1] >= 0xdc00 && u[k + 1] < 0xe000)
			c = 0x10000 + ((c - 0xd800) << 10) + (u[++k] - 0xdc00);
		else if (c >= 0xd800 && c < 0xe000)
			c = 0xfffd;
		put_code_point_to(f, c);
	}
}
void rt_print_str(int64_t s) { rt_put_units(s); putchar('\n'); }
void rt_put_str(int64_t s) { rt_put_units(s); putchar(' '); }

/* ToString of numbers, booleans, null, undefined (into a small buffer of ASCII) */
static int to_ascii(int64_t a, char *buf)
{
	if (is_number(a)) {
		int64_t v;
		double d;
		if (whole_word(a, &v)) { snprintf(buf, 24, "%lld", (long long)v); return 1; }   /* (CJI-3; -0 as "0") */
		d = to_double(a);
		if (d == 0) strcpy(buf, "0"); else format_number(d, buf);   /* String(-0) is "0" */
		return 1;
	}
	if (a == ANY_TRUE || a == ANY_FALSE) { strcpy(buf, a == ANY_TRUE ? "true" : "false"); return 1; }
	if (a == ANY_NULL) { strcpy(buf, "null"); return 1; }
	if (a == ANY_UNDEFINED) { strcpy(buf, "undefined"); return 1; }
	return 0;
}

int64_t rt_int_to_str(int64_t n, int64_t *roots)
{
	char buf[32];
	snprintf(buf, sizeof buf, "%lld", (long long)n);
	return string_of_ascii(buf, roots);
}
int64_t rt_num_to_str(int64_t bits, int64_t *roots)
{
	char buf[64];
	double d;
	int64_t v;
	if (whole_bits((uint64_t)bits, &v)) {   /* (CJI-3; -0 as "0") */
		snprintf(buf, 24, "%lld", (long long)v);
		return string_of_ascii(buf, roots);
	}
	d = bits_double(bits);
	if (d == 0) strcpy(buf, "0"); else format_number(d, buf);
	return string_of_ascii(buf, roots);
}
int64_t rt_bool_to_str(int64_t b) { return word_string(b ? "true" : "false"); }
int64_t rt_any_to_str(int64_t a, int64_t *roots)
{
	char buf[64];
	if (is_string(a))
		return a;
	if (is_error(a))   /* chapter 14 */
		return error_string(a, roots);
	if (to_ascii(a, buf))
		return string_of_ascii(buf, roots);
	type_error("an array, function or object used as a string is outside the subset");
	return 0;
}
int64_t rt_any_as_str(int64_t a)
{
	if (!is_string(a))
		type_error("type error: expected a string");
	return a;
}
int64_t rt_any_typeof_str(int64_t a)
{
	static const char *names[] = { "undefined", "boolean", "number", "object", "function", "string" };
	return word_string(names[rt_any_typeof(a)]);
}

/* ToString of both, then their units one after the other. */
static int64_t str_concat_values(int64_t a, int64_t b, int64_t *roots)
{
	int64_t keep[2], *p;
	char ba[64], bb[64];
	int sa, sb;
	int64_t na, nb;
	if (is_error(a)) { roots[0] = b; a = error_string(a, roots + 1); b = roots[0]; }   /* chapter 14 */
	if (is_error(b)) { roots[0] = a; b = error_string(b, roots + 1); a = roots[0]; }
	sa = is_string(a);
	sb = is_string(b);
	if (!sa && !to_ascii(a, ba)) type_error("an array, function or object used as a string is outside the subset");
	if (!sb && !to_ascii(b, bb)) type_error("an array, function or object used as a string is outside the subset");
	na = sa ? slen(a) : (int64_t)strlen(ba);
	nb = sb ? slen(b) : (int64_t)strlen(bb);
	keep[0] = a;
	keep[1] = b;
	p = new_string(na + nb, roots, keep, 2);
	a = keep[0];
	b = keep[1];
	for (int64_t k = 0; k < na; k++)
		((uint16_t *)(p + 2))[k] = sa ? units(a)[k] : (uint16_t)ba[k];
	for (int64_t k = 0; k < nb; k++)
		((uint16_t *)(p + 2))[na + k] = sb ? units(b)[k] : (uint16_t)bb[k];
	return (int64_t)p;
}
int64_t rt_str_concat(int64_t a, int64_t b, int64_t *roots) { return str_concat_values(a, b, roots); }

/* A slice [from, to) of s, as a new string. */
static int64_t substr(int64_t s, int64_t from, int64_t to, int64_t *roots)
{
	int64_t keep[1] = { s }, *p;
	if (to < from) to = from;
	p = new_string(to - from, roots, keep, 1);
	memcpy(p + 2, units(keep[0]) + from, (size_t)(to - from) * 2);
	return (int64_t)p;
}

int64_t rt_str_index(int64_t s, int64_t i, int64_t *roots)
{
	if (i < 0 || i >= slen(s)) {
		char msg[96];
		snprintf(msg, sizeof msg, "index out of range: %lld in a string of length %lld", (long long)i, (long long)slen(s));
		type_error(msg);
	}
	return substr(s, i, i + 1, roots);
}

/* ToIntegerOrInfinity, clamped to [0, n]; with negative positions counting from the end
 * (slice) or not (substring and the searches). */
static int64_t clamp_pos(double x, int64_t n, int from_end)
{
	if (x != x) return 0;
	x = trunc(x);
	if (x < 0 && from_end) x = n + x < 0 ? 0 : n + x;
	if (x < 0) return 0;
	return x > n ? n : (int64_t)x;
}
/* (CJI-3: the same of a Number's bits: a whole number, or +Infinity (an argument left out), in integers) */
static int64_t clamp_bits(int64_t bits, int64_t n, int from_end)
{
	int64_t v;
	if ((uint64_t)bits == 0x7ff0000000000000ULL)
		return n;
	if (!whole_bits((uint64_t)bits, &v))
		return clamp_pos(bits_double(bits), n, from_end);
	if (v < 0 && from_end) v = n + v < 0 ? 0 : n + v;
	if (v < 0) return 0;
	return v > n ? n : v;
}

int64_t rt_str_charAt(int64_t s, int64_t ib, int64_t *roots)
{
	double i;
	int64_t v;
	if (whole_bits((uint64_t)ib, &v))   /* (CJI-3) */
		return v < 0 || v >= slen(s) ? word_string("") : substr(s, v, v + 1, roots);
	i = bits_double(ib);
	int64_t k = i != i ? 0 : (int64_t)trunc(i);
	if (i != i) i = 0;
	if (trunc(i) < 0 || trunc(i) >= (double)slen(s)) return word_string("");
	return substr(s, k, k + 1, roots);
}
int64_t rt_str_charCodeAt(int64_t s, int64_t ib)
{
	double i;
	int64_t v;
	if (whole_bits((uint64_t)ib, &v))   /* (CJI-3: the unit's value as a Number's bits, in integers) */
		return v < 0 || v >= slen(s) ? double_bits(NAN) : (int64_t)whole_to_bits(units(s)[v]);
	i = bits_double(ib);
	if (i != i) i = 0;
	i = trunc(i);
	if (i < 0 || i >= (double)slen(s)) return double_bits(NAN);
	return double_bits(units(s)[(int64_t)i]);
}
static int64_t find(int64_t s, int64_t t, int64_t from)
{
	int64_t n = slen(s), m = slen(t);
	for (int64_t k = from; k + m <= n; k++)
		if (!memcmp(units(s) + k, units(t), (size_t)m * 2))
			return k;
	return -1;
}
int64_t rt_str_indexOf(int64_t s, int64_t t, int64_t from) { return find(s, t, clamp_bits(from, slen(s), 0)); }
int64_t rt_str_lastIndexOf(int64_t s, int64_t t, int64_t from)
{
	double f = bits_double(from);   /* chapter 21: from, NaN meaning the end */
	int64_t start = slen(s) - slen(t), p = isnan(f) || f >= (double)slen(s) ? slen(s) : f <= 0 ? 0 : (int64_t)f;
	if (p < start) start = p;
	for (int64_t k = start; k >= 0; k--)
		if (!memcmp(units(s) + k, units(t), (size_t)slen(t) * 2))
			return k;
	return -1;
}
int64_t rt_str_includes(int64_t s, int64_t t, int64_t from) { return rt_str_indexOf(s, t, from) >= 0; }
int64_t rt_str_startsWith(int64_t s, int64_t t, int64_t pos)
{
	int64_t p = clamp_bits(pos, slen(s), 0);
	return p + slen(t) <= slen(s) && !memcmp(units(s) + p, units(t), (size_t)slen(t) * 2);
}
int64_t rt_str_endsWith(int64_t s, int64_t t, int64_t end)
{
	int64_t e = clamp_bits(end, slen(s), 0), p = e - slen(t);
	return p >= 0 && !memcmp(units(s) + p, units(t), (size_t)slen(t) * 2);
}
int64_t rt_str_slice(int64_t s, int64_t a, int64_t b, int64_t *roots)
{
	int64_t n = slen(s);
	return substr(s, clamp_bits(a, n, 1), clamp_bits(b, n, 1), roots);
}
int64_t rt_str_substring(int64_t s, int64_t a, int64_t b, int64_t *roots)
{
	int64_t n = slen(s), x = clamp_bits(a, n, 0), y = clamp_bits(b, n, 0);
	return x <= y ? substr(s, x, y, roots) : substr(s, y, x, roots);
}
/* Case mapping, one code unit at a time, from the generated table (casemap.h). */
static uint16_t map_unit(uint16_t c, const uint16_t (*map)[2], int64_t n)
{
	int64_t lo = 0, hi = n - 1;
	while (lo <= hi) {
		int64_t mid = (lo + hi) / 2;
		if (map[mid][0] == c) return map[mid][1];
		if (map[mid][0] < c) lo = mid + 1; else hi = mid - 1;
	}
	return c;
}
static int64_t map_case(int64_t s, int upper, int64_t *roots)
{
	int64_t keep[1] = { s }, n = slen(s), *p = new_string(n, roots, keep, 1);
	for (int64_t k = 0; k < n; k++) {
		uint16_t c = units(keep[0])[k];
		((uint16_t *)(p + 2))[k] = upper ? map_unit(c, upper_map, sizeof upper_map / sizeof upper_map[0])
			: map_unit(c, lower_map, sizeof lower_map / sizeof lower_map[0]);
	}
	return (int64_t)p;
}
int64_t rt_str_toUpperCase(int64_t s, int64_t *roots) { return map_case(s, 1, roots); }
int64_t rt_str_toLowerCase(int64_t s, int64_t *roots) { return map_case(s, 0, roots); }
static int is_space(uint16_t c)
{
	return c == 9 || c == 10 || c == 11 || c == 12 || c == 13 || c == 32 || c == 0xa0 || c == 0x1680
		|| (c >= 0x2000 && c <= 0x200a) || c == 0x2028 || c == 0x2029 || c == 0x202f || c == 0x205f
		|| c == 0x3000 || c == 0xfeff;
}
int64_t rt_str_trim(int64_t s, int64_t mode, int64_t *roots)
{
	int64_t a = 0, b = slen(s);
	if (mode & 1) while (a < b && is_space(units(s)[a])) a++;
	if (mode & 2) while (b > a && is_space(units(s)[b - 1])) b--;
	return substr(s, a, b, roots);
}
int64_t rt_str_repeat(int64_t s, int64_t nb, int64_t *roots)
{
	double n = bits_double(nb);
	int64_t keep[1] = { s }, count, len, *p;
	if (isnan(n)) n = 0;
	if (trunc(n) < 0 || isinf(n)) {   /* chapter 14: a RangeError the program can catch */
		char msg[64], num[32];
		format_number(n, num);
		snprintf(msg, sizeof msg, "Invalid count value: %s", num);
		return throw_error("RangeError", msg, roots);
	}
	count = (int64_t)trunc(n);
	len = slen(s) * count;
	p = new_string(len, roots, keep, 1);
	for (int64_t k = 0; k < count; k++)
		memcpy((uint16_t *)(p + 2) + k * slen(keep[0]), units(keep[0]), (size_t)slen(keep[0]) * 2);
	return (int64_t)p;
}
static int64_t pad(int64_t s, int64_t nb, int64_t fill, int at_start, int64_t *roots)
{
	double n;
	int64_t keep[2] = { s, fill }, len = slen(s), target, extra, *p, v;
	if (whole_bits((uint64_t)nb, &v))   /* (CJI-3) */
		target = v > len ? v : len;
	else {
		n = bits_double(nb);
		if (n != n) n = 0;
		target = n > (double)len ? (int64_t)trunc(n) : len;
	}
	extra = target - len;
	if (extra == 0 || slen(fill) == 0) return s;
	p = new_string(target, roots, keep, 2);
	s = keep[0];
	fill = keep[1];
	for (int64_t k = 0; k < extra; k++)
		((uint16_t *)(p + 2))[(at_start ? 0 : len) + k] = units(fill)[k % slen(fill)];
	memcpy((uint16_t *)(p + 2) + (at_start ? extra : 0), units(s), (size_t)len * 2);
	return (int64_t)p;
}
int64_t rt_str_padStart(int64_t s, int64_t n, int64_t fill, int64_t *roots) { return pad(s, n, fill, 1, roots); }
int64_t rt_str_padEnd(int64_t s, int64_t n, int64_t fill, int64_t *roots) { return pad(s, n, fill, 0, roots); }
int64_t rt_str_fromCharCode(int64_t cb, int64_t *roots)
{
	double c;
	int64_t v;
	uint16_t u;
	if (whole_bits((uint64_t)cb, &v)) {   /* (CJI-3: ToUint16 of a whole number is its low 16 bits) */
		u = (uint16_t)(uint64_t)v;
		return string_of(&u, 1, roots);
	}
	c = bits_double(cb);
	u = (uint16_t)(c != c || isinf(c) ? 0 : (int64_t)fmod(trunc(c), 65536.0));
	return string_of(&u, 1, roots);
}

/* s.split(sep): an array of pointers (kind 1), made first and kept on the root stack
 * while each piece is made. An empty separator splits into code units. */
int64_t rt_str_split(int64_t s, int64_t sep, int64_t *roots)
{
	int64_t keep[3], count = 0, *arr, k = 0, start = 0;
	int64_t n = slen(s), m = slen(sep);
	if (m == 0) count = n;
	else {
		for (int64_t p = 0; (p = find(s, sep, p)) >= 0; p += m)
			count++;
		count++;
	}
	keep[0] = s;
	keep[1] = sep;
	arr = alloc_words(count + 3, roots, keep, 2);   /* the array and its storage, as compiled code makes them */
	arr[0] = ARRAY_HEADER;
	arr[1] = count;
	arr[2] = (int64_t)(arr + 3);
	arr[3] = count << 3 | 1 << 1 | 1;
	for (int64_t i = 0; i < count; i++)
		arr[i + 4] = 0;
	keep[2] = (int64_t)arr;
	for (int64_t i = 0; i < count; i++) {
		int64_t end, *piece;
		if (m == 0) end = start + 1;
		else {
			end = find(keep[0], keep[1], start);
			if (end < 0) end = slen(keep[0]);
		}
		piece = new_string(end - start, roots, keep, 3);
		memcpy(piece + 2, units(keep[0]) + start, (size_t)(end - start) * 2);
		arr_elems(keep[2])[i] = (int64_t)piece;
		start = end + m;
		k++;
	}
	return keep[2];
}

/* arr.join(sep); kind says what the elements are: 0 Int, 1 Number, 2 String, 3 Bool, 4 Any. */
static int64_t element_text(int64_t w, int kind, char *buf, int64_t *len)
{
	if (kind == 2 || (kind == 4 && is_string(w))) { *len = slen(w); return 1; }
	if (kind == 0) snprintf(buf, 32, "%lld", (long long)w);
	else if (kind == 1) { double d = bits_double(w); if (d == 0) strcpy(buf, "0"); else format_number(d, buf); }
	else if (kind == 3) strcpy(buf, w ? "true" : "false");
	else if (w == ANY_NULL || w == ANY_UNDEFINED) buf[0] = 0;
	else if (!to_ascii(w, buf)) type_error("an array, function or object used as a string is outside the subset");
	*len = (int64_t)strlen(buf);
	return 0;
}
int64_t rt_arr_join(int64_t arr, int64_t sep, int64_t kind, int64_t *roots)
{
	int64_t n = arr_len(arr), total = 0, keep[2], *p, at = 0;
	char buf[64];
	for (int64_t i = 0; i < n; i++) {
		int64_t len;
		element_text(arr_elems(arr)[i], (int)kind, buf, &len);
		total += len + (i ? slen(sep) : 0);
	}
	keep[0] = arr;
	keep[1] = sep;
	p = new_string(total, roots, keep, 2);
	arr = keep[0];
	sep = keep[1];
	for (int64_t i = 0; i < n; i++) {
		int64_t w = arr_elems(arr)[i], len;
		if (i) { memcpy((uint16_t *)(p + 2) + at, units(sep), (size_t)slen(sep) * 2); at += slen(sep); }
		if (element_text(w, (int)kind, buf, &len)) memcpy((uint16_t *)(p + 2) + at, units(w), (size_t)len * 2);
		else for (int64_t k = 0; k < len; k++) ((uint16_t *)(p + 2))[at + k] = (uint16_t)buf[k];
		at += len;
	}
	return (int64_t)p;
}

/* JavaScript's ToNumber of a string: its StringNumericLiteral, or NaN. */
static double string_to_number(int64_t s)
{
	char buf[128], *end;
	int64_t n = slen(s), a = 0, b = n, k = 0;
	double d;
	while (a < b && is_space(units(s)[a])) a++;
	while (b > a && is_space(units(s)[b - 1])) b--;
	if (a == b) return 0;
	if (b - a >= (int64_t)sizeof buf) return NAN;
	for (int64_t i = a; i < b; i++) {
		uint16_t c = units(s)[i];
		if (c > 127) return NAN;
		buf[k++] = (char)c;
	}
	buf[k] = 0;
	if (buf[0] == '0' && (buf[1] == 'x' || buf[1] == 'X' || buf[1] == 'b' || buf[1] == 'B' || buf[1] == 'o' || buf[1] == 'O')) {
		int base = buf[1] == 'x' || buf[1] == 'X' ? 16 : buf[1] == 'b' || buf[1] == 'B' ? 2 : 8;
		double v = 0;
		if (!buf[2]) return NAN;
		for (char *p = buf + 2; *p; p++) {
			int digit = isdigit((unsigned char)*p) ? *p - '0' : isalpha((unsigned char)*p) ? (tolower((unsigned char)*p) - 'a' + 10) : 99;
			if (digit >= base) return NAN;
			v = v * base + digit;
		}
		return v;
	}
	if (!strcmp(buf, "Infinity") || !strcmp(buf, "+Infinity")) return INFINITY;
	if (!strcmp(buf, "-Infinity")) return -INFINITY;
	for (char *p = buf; *p; p++)   /* only digits, one point, an exponent and signs */
		if (!isdigit((unsigned char)*p) && !strchr("+-.eE", *p))
			return NAN;
	d = strtod(buf, &end);
	return *end ? NAN : d;
}

/* Records: a dynamic access finds the field by name in the shape. */
/* (CJI-3, lane 6: the answers for a shape and a name outside the heap, cached. A shape is always static
   (slas makes them; the collector never follows one), and a name outside the current space is a static
   string (a literal, or one the runtime made once): neither ever moves, changes or is freed, so the
   answer for the pair never changes. A name in the heap is not cached: its address is reused.) */
enum { FIELD_CACHE = 4096 };
static struct { int64_t shape, name, k; } field_cache[FIELD_CACHE];
static int64_t field_index(int64_t o, int64_t name)
{
	int64_t *shape = (int64_t *)((int64_t *)o)[1], k;
#ifdef ESP_PLATFORM
	/* Module literals and shapes are freed on unload. Never retain their addresses
	   in the shared firmware cache (which also occupies 96 KiB of internal RAM). */
	const int cached = 0;
#else
	int cached = (uint64_t)name < (uint64_t)(uintptr_t)fromspace_begin || (uint64_t)name >= (uint64_t)(uintptr_t)fromspace_end;
#endif
	uint64_t h = 0;
	if (cached) {
		h = (((uint64_t)(uintptr_t)shape >> 3) * 0x9E3779B97F4A7C15ULL ^ ((uint64_t)name >> 3)) * 0x9E3779B97F4A7C15ULL >> 52;
		if (field_cache[h].shape == (int64_t)(intptr_t)shape && field_cache[h].name == name)
			return field_cache[h].k;
	}
	for (k = 0; k < shape[0]; k++)
		if (str_equal(shape[k + 1], name))
			break;
	if (k == shape[0])
		k = -1;
	if (cached) {
		field_cache[h].shape = (int64_t)(intptr_t)shape;
		field_cache[h].name = name;
		field_cache[h].k = k;
	}
	return k;
}
/* Chapter 19: a record's last word holds the properties added to it at run time: undefined,
 * or an Any[] of names and values, two elements each. A field of the shape that is deleted
 * holds undefined, and the pair (its name, HOLE) says that it is gone, for `in` and
 * Object.keys. */
#define ANY_HOLE 14
static int64_t *extra_slot(int64_t o) { return &((int64_t *)o)[((int64_t *)((int64_t *)o)[1])[0] + 2]; }
static int64_t extra_find(int64_t o, int64_t name)   /* the pair's index in the extras, or -1 */
{
	int64_t x = *extra_slot(o);
	if (!is_array(x)) return -1;
	for (int64_t k = 0; k < arr_len(x); k += 2)
		if (str_equal(arr_elems(x)[k], name)) return k;
	return -1;
}
static void extra_remove(int64_t o, int64_t k)
{
	int64_t x = *extra_slot(o), n = arr_len(x);
	memmove(arr_elems(x) + k, arr_elems(x) + k + 2, (size_t)(n - k - 2) * 8);
	arr_elems(x)[n - 2] = arr_elems(x)[n - 1] = ANY_UNDEFINED;
	((int64_t *)x)[1] = n - 2;
}
/* A new Any[] of n elements, undefined; the nkeep words of keep[] survive. */
static int64_t new_any_array(int64_t n, int64_t *roots, int64_t *keep, int nkeep)
{
	int64_t *arr = alloc_words(n + 3, roots, keep, nkeep);
	arr[0] = ARRAY_HEADER;
	arr[1] = n;
	arr[2] = (int64_t)(arr + 3);
	arr[3] = n << 3 | 1 << 1 | 1;
	for (int64_t i = 0; i < n; i++)
		arr[i + 4] = ANY_UNDEFINED;
	return (int64_t)arr;
}
/* Appends the pair (name, v) to o's extras; returns o, which may have moved. */
static int64_t extra_add(int64_t o, int64_t name, int64_t v, int64_t *roots)
{
	int64_t x = *extra_slot(o), n;
	roots[0] = o; roots[1] = name; roots[2] = v;
	if (!is_array(x)) {
		int64_t keep[3] = { o, name, v };
		x = new_any_array(0, roots + 3, keep, 3);
		roots[0] = keep[0]; roots[1] = keep[1]; roots[2] = keep[2];
		*extra_slot(roots[0]) = x;
	}
	n = arr_len(x);
	rt_arr_resize(x, n + 2, ANY_UNDEFINED, roots + 3);
	x = *extra_slot(roots[0]);
	arr_elems(x)[n] = roots[1];
	arr_elems(x)[n + 1] = roots[2];
	return roots[0];
}
int64_t rt_any_get(int64_t o, int64_t name)
{
	if (is_record(o)) {   /* a name among the extras is there (a deleted field, or one added again) */
		int64_t x = extra_find(o, name), k;
		if (x >= 0) { int64_t v = arr_elems(*extra_slot(o))[x + 1]; return v == ANY_HOLE ? ANY_UNDEFINED : v; }
		k = field_index(o, name);   /* (chapter 20: a field holding HOLE is one the object lacks) */
		return k < 0 || ((int64_t *)o)[k + 2] == ANY_HOLE ? ANY_UNDEFINED : ((int64_t *)o)[k + 2];
	}
	if (slen(name) == 6 && !memcmp(units(name), u"length", 12)) {
		if (is_string(o)) return from_double((double)slen(o));
		if (is_array(o)) return from_double((double)arr_len(o));
	}
	if (o == ANY_NULL || o == ANY_UNDEFINED) return throw_null_read(o, name);   /* chapter 23 */
	return ANY_UNDEFINED;
}
int64_t rt_any_set(int64_t o, int64_t name, int64_t v, int64_t *roots)
{
	int64_t k, x;
	if (!is_record(o)) type_error("setting a property of a value that is not an object is outside the subset");
	k = field_index(o, name);
	x = extra_find(o, name);
	if (x < 0 && k >= 0)
		((int64_t *)o)[k + 2] = v;
	else if (x >= 0 && arr_elems(*extra_slot(o))[x + 1] != ANY_HOLE)
		arr_elems(*extra_slot(o))[x + 1] = v;
	else {   /* chapter 19: a new property, or a deleted one made again: last */
		if (x >= 0) extra_remove(o, x);
		extra_add(o, name, v, roots);
		v = roots[2];   /* (extra_add keeps it there) */
	}
	return v;
}
/* A property key: a string as it is, anything else converted (o[1] is o["1"]). */
static int64_t key_of(int64_t k, int64_t *roots) { return is_string(k) ? k : rt_any_to_str(k, roots); }
static int index_of_number(int64_t k, int64_t n, int64_t *i)   /* k an integer in [0, n) */
{
	int64_t v;   /* (CJI-3: by the bits: any other number, fractional, NaN or past 2^53, is no index) */
	if (!whole_word(k, &v) || v < 0 || v >= n) return 0;
	*i = v;
	return 1;
}
/* CJI-3: a typed array as a dynamic value. A typed array is a library class's instance (classes.js
 * typed): a record { $u32: items, length: n }, its first field named by its kind; a record that
 * is a dynamic value holds dynamic values, so its items are an Any[] of numbers. o[k] and o[k] = v
 * of such a value are its items' (a write converted as the kind converts, one outside it ignored),
 * as in JavaScript. Returns the kind (an index in brands), or -1 for anything else. */
static int typed_kind(int64_t o)
{
	static const char *brands[] = { "$u8", "$i8", "$c8", "$i16", "$u16", "$i32", "$u32", "$f32", "$f64" };
	int64_t *shape, name;
	if (!is_record(o))
		return -1;
	shape = (int64_t *)((int64_t *)o)[1];
	if (shape[0] < 2 || !is_array(((int64_t *)o)[2]))
		return -1;
	name = shape[1];
	if (slen(name) < 3 || slen(name) > 4 || units(name)[0] != '$')   /* (CJI-3, lane 6: every brand is "$" and */
		return -1;                                             /* two or three more units) */
	for (int b = 0; b < 9; b++) {
		int64_t n = (int64_t)strlen(brands[b]), k = 0;
		if (slen(name) != n)
			continue;
		while (k < n && units(name)[k] == (uint16_t)brands[b][k])
			k++;
		if (k == n)
			return b;
	}
	return -1;
}
static int64_t typed_convert(int kind, int64_t v)
{
	double d = to_number(v), f;
	switch (kind) {
	case 0: return from_double((double)(to_int32(d) & 255));
	case 1: return from_double((double)(int8_t)to_int32(d));
	case 2:   /* (Uint8ClampedArray: to 0..255, ties to even) */
		if (!(d > 0)) return from_double(0);
		if (d >= 255) return from_double(255);
		f = floor(d);
		return from_double(d - f < 0.5 ? f : d - f > 0.5 ? f + 1 : fmod(f, 2) == 0 ? f : f + 1);
	case 3: return from_double((double)(int16_t)to_int32(d));
	case 4: return from_double((double)(to_int32(d) & 65535));
	case 5: return from_double((double)(int32_t)to_int32(d));
	case 6: return from_double((double)(uint32_t)to_int32(d));
	case 7: return from_double((double)(float)d);
	default: return from_double(d);
	}
}

/* o[k] of a dynamic o: an element of an array or a string (a number outside it stops the
 * program, as a typed index does), or a property */
int64_t rt_any_index(int64_t o, int64_t k, int64_t *roots)
{
	/* (CJI-3, lane 6: an array or a string first, the common case; a typed array is a record, never one
	   of them, so the order changes no answer) */
	if ((is_array(o) || is_string(o)) && is_number(k)) {
		/* chapter 23: past the end (or not a whole number) is undefined, as in JavaScript */
		int64_t n = is_string(o) ? slen(o) : arr_len(o), i;
		if (!index_of_number(k, n, &i)) return ANY_UNDEFINED;   /* (CJI-3: in integers) */
		if (is_string(o)) return rt_str_index(o, i, roots);
		return arr_elems(o)[i];
	}
	if (is_number(k) && typed_kind(o) >= 0) {   /* CJI-3 */
		int64_t items = ((int64_t *)o)[2], i;
		return index_of_number(k, arr_len(items), &i) ? arr_elems(items)[i] : ANY_UNDEFINED;
	}
	if (o == ANY_NULL || o == ANY_UNDEFINED) return throw_null_read(o, k);   /* chapter 23 */
	roots[0] = o;
	k = key_of(k, roots + 1);
	return rt_any_get(roots[0], k);
}
/* o[k] = v of a dynamic o: an array's element, or a property */
int64_t rt_any_set_index(int64_t o, int64_t k, int64_t v, int64_t *roots)
{
	int kind;
	if (is_number(k) && (kind = typed_kind(o)) >= 0) {   /* CJI-3 */
		int64_t items = ((int64_t *)o)[2], i, x = typed_convert(kind, v);
		if (index_of_number(k, arr_len(items), &i))
			arr_elems(items)[i] = x;
		return v;
	}
	if (is_array(o) && is_number(k)) {
		int64_t i = rt_any_to_int(k);
		if (i < 0 || i >= arr_len(o)) rt_index_error();
		arr_elems(o)[i] = v;
		return v;
	}
	if (!is_record(o)) type_error("setting a property of a value that is not an object is outside the subset");
	roots[0] = o; roots[1] = v;
	k = key_of(k, roots + 2);
	return rt_any_set(roots[0], k, roots[1], roots + 2);
}
/* delete o[k]: true */
int64_t rt_any_delete(int64_t o, int64_t k, int64_t *roots)
{
	int64_t f, x;
	if (!is_record(o)) return 1;
	roots[0] = o;
	k = key_of(k, roots + 1);
	o = roots[0];
	f = field_index(o, k);
	x = extra_find(o, k);
	if (x >= 0) extra_remove(o, x);
	if (f >= 0) {   /* a field: gone, as the pair (name, HOLE) says */
		((int64_t *)o)[f + 2] = ANY_UNDEFINED;
		extra_add(o, k, ANY_HOLE, roots);
	}
	return 1;
}
/* k in o: an own property (or an array's index, or its length) */
int64_t rt_any_in(int64_t k, int64_t o, int64_t *roots)
{
	int64_t f, x, i;
	if (is_array(o)) return index_of_number(k, arr_len(o), &i) || (is_string(k) && str_equal(k, word_string("length")));
	if (!is_record(o)) type_error("TypeError: 'in' needs an object");
	roots[0] = o;
	k = key_of(k, roots + 1);
	o = roots[0];
	f = field_index(o, k);
	x = extra_find(o, k);
	if (x >= 0) return arr_elems(*extra_slot(o))[x + 1] != ANY_HOLE;
	return f >= 0 && ((int64_t *)o)[f + 2] != ANY_HOLE;
}
/* Object.keys(o): a new Any[] of the names (a record's fields, then what was added), or
 * an array's or a string's indices */
/* An integer key ("0", "17", below 2^32 - 1, no leading zero): its value, else -1. */
static int64_t integer_key(int64_t s)
{
	int64_t n = slen(s), v = 0;
	if (n == 0 || n > 10 || (n > 1 && units(s)[0] == '0')) return -1;
	for (int64_t k = 0; k < n; k++) {
		uint16_t c = units(s)[k];
		if (c < '0' || c > '9') return -1;
		v = v * 10 + (c - '0');
	}
	return v < 4294967295LL ? v : -1;
}
/* JavaScript's order of an object's keys: integer keys first, ascending, then the others as
   they were made (a stable insertion sort; the integer keys of a literal are already first). */
static void key_order(int64_t *ks, int64_t n)
{
	for (int64_t i = 1; i < n; i++) {
		int64_t s = ks[i], v = integer_key(s), j = i;
		if (v < 0) continue;
		while (j > 0) {
			int64_t w = integer_key(ks[j - 1]);
			if (w >= 0 && w <= v) break;
			ks[j] = ks[j - 1];
			j--;
		}
		ks[j] = s;
	}
}
int64_t rt_any_keys(int64_t o, int64_t *roots)
{
	int64_t keep[1] = { o }, n = 0, arr, j = 0;
	if (is_record(o)) {
		int64_t *shape = (int64_t *)((int64_t *)o)[1], x = *extra_slot(o);
		for (int64_t k = 0; k < shape[0]; k++)
			if (extra_find(o, shape[k + 1]) < 0 && ((int64_t *)o)[k + 2] != ANY_HOLE) n++;
		if (is_array(x))
			for (int64_t k = 0; k < arr_len(x); k += 2)
				if (arr_elems(x)[k + 1] != ANY_HOLE) n++;
		arr = new_any_array(n, roots, keep, 1);
		o = keep[0];
		shape = (int64_t *)((int64_t *)o)[1];
		x = *extra_slot(o);
		for (int64_t k = 0; k < shape[0]; k++)
			if (extra_find(o, shape[k + 1]) < 0 && ((int64_t *)o)[k + 2] != ANY_HOLE) arr_elems(arr)[j++] = shape[k + 1];
		if (is_array(x))
			for (int64_t k = 0; k < arr_len(x); k += 2)
				if (arr_elems(x)[k + 1] != ANY_HOLE) arr_elems(arr)[j++] = arr_elems(x)[k];
		key_order(arr_elems(arr), n);   /* (an integer key added at run time goes first) */
		return arr;
	}
	if (is_array(o) || is_string(o)) {
		n = ((int64_t *)o)[1];
		arr = new_any_array(n, roots, keep, 0);
		roots[0] = arr;
		for (int64_t k = 0; k < n; k++) {
			int64_t s = rt_int_to_str(k, roots + 1);
			arr_elems(roots[0])[k] = s;
		}
		return roots[0];
	}
	if (o == ANY_NULL || o == ANY_UNDEFINED) type_error("TypeError: cannot convert undefined or null to object");
	return new_any_array(0, roots, keep, 0);
}
int64_t rt_any_to_record(int64_t o, int64_t shape)
{
	if (!is_record(o) || ((int64_t *)o)[1] != shape)
		type_error("type error: expected an object with other fields");
	return o;
}

/* ---- chapter 14: exceptions --------------------------------------------------------------
 * exc_flag is 1 while an exception is on its way to a handler, and exc_value is the value
 * thrown: compiled code sets both at a throw and tests exc_flag after every call. The
 * collector treats exc_value as a root. An Error is a record whose shape ends with a 1. */
int64_t exc_flag, exc_value;

static int is_error(int64_t w)
{
	int64_t *shape;
	if (!is_record(w))
		return 0;
	shape = (int64_t *)((int64_t *)w)[1];
	return shape[shape[0] + 1] == 1;
}
/* Error.prototype.toString: name, ": ", message; either alone when the other is empty.
 * Each step may collect, so the strings in hand wait on the root stack. */
static int64_t error_string(int64_t e, int64_t *roots)
{
	int64_t name = rt_any_get(e, word_string("name")), msg = rt_any_get(e, word_string("message")), n, m;
	roots[0] = msg;
	n = name == ANY_UNDEFINED ? word_string("Error") : rt_any_to_str(name, roots + 1);
	msg = roots[0];
	roots[0] = n;
	m = msg == ANY_UNDEFINED ? word_string("") : rt_any_to_str(msg, roots + 1);
	n = roots[0];
	if (slen(n) == 0)
		return m;
	if (slen(m) == 0)
		return n;
	roots[0] = m;
	n = str_concat_values(n, word_string(": "), roots + 1);
	m = roots[0];
	return str_concat_values(n, m, roots);
}
/* A new Error, thrown by the runtime: the two globals are set, and the operation's result
 * (which the compiled code never uses: it tests exc_flag next) is 0. */
static int64_t throw_error(const char *name, const char *message, int64_t *roots)
{
	int64_t keep[1], *p;
	keep[0] = string_of_ascii(message, roots);
	p = alloc_words(4, roots, keep, 1);
	p[0] = RECORD_BIT | (14LL << 16) | (4 << 3) | (2 << 1) | 1;
	p[1] = error_shape();
	p[2] = keep[0];
	p[3] = word_string(name);
	p[4] = ANY_UNDEFINED;   /* chapter 19: no properties added */
	exc_value = (int64_t)p;
	exc_flag = 1;
	return 0;
}
/* Chapter 23: reading a property of null or undefined throws a TypeError, as in JavaScript,
 * with V8's text: "Cannot read properties of null (reading 'list')". rt_any_get has no roots
 * to allocate with, so the Error is a static object, made on first use for each kind and key
 * (a program's keys are mostly the names in its text) and kept; its fields are static
 * strings, which the collector leaves where they are. Past 256 of them, or for a key that is
 * neither a string nor a number, the text leaves the key out. (A program that adds a property
 * to such an Error would store a heap pointer the collector does not see: the one thing a
 * caught TypeError of this kind must not be given.) */
static int64_t null_read_error(int kind, const uint16_t *key, int64_t klen)
{
	static struct { int kind; int64_t key; int64_t *err; } made[256];
	static int count;
	static int64_t generic[2][5];
	const char *head = kind ? "Cannot read properties of null" : "Cannot read properties of undefined";
	uint16_t u[200];
	int64_t n = 0, *e;
	for (int i = 0; key && i < count; i++)
		if (made[i].kind == kind && slen(made[i].key) == klen && !memcmp(units(made[i].key), key, (size_t)klen * 2))
			return (int64_t)made[i].err;
	if (key && (count == 256 || klen > 120))
		key = NULL;
	e = key ? malloc(5 * sizeof(int64_t)) : generic[kind];
	if (!key && e[0])
		return (int64_t)e;
	for (const char *c = head; *c; c++) u[n++] = (uint16_t)*c;
	if (key) {
		for (const char *c = " (reading '"; *c; c++) u[n++] = (uint16_t)*c;
		memcpy(u + n, key, (size_t)klen * 2);
		n += klen;
		u[n++] = '\''; u[n++] = ')';
	}
	e[0] = RECORD_BIT | (14LL << 16) | (4 << 3) | (2 << 1) | 1;
	e[1] = error_shape();
	e[2] = rt_static_string(u, n);
	e[3] = word_string("TypeError");
	e[4] = ANY_UNDEFINED;
	if (key) {
		made[count].kind = kind;
		made[count].key = rt_static_string(key, klen);
		made[count++].err = e;
	}
	return (int64_t)e;
}
static int64_t throw_null_read(int64_t o, int64_t key)
{
	uint16_t u[64];
	char buf[64];
	int64_t n = 0;
	const uint16_t *k = NULL;
	if (is_string(key)) { k = units(key); n = slen(key); }
	else if (is_number(key)) {
		format_number(to_double(key), buf);
		for (; buf[n]; n++) u[n] = (uint16_t)buf[n];
		k = u;
	}
	exc_value = null_read_error(o == ANY_NULL, k, n);
	exc_flag = 1;
	return ANY_UNDEFINED;
}
static size_t to_utf8(int64_t s, char *out, size_t max);
/* main's exit for an exception nobody caught: report it, and stop as a trap does. */
void rt_uncaught(int64_t v)
{
	static const char *names[] = { "undefined", "boolean", "number", "object", "function", "string" };
	char buf[64];
	/* The ELF embedder owns termination. Its fatal callback may longjmp
	   and retain this pointer until the kernel records the world fault. */
	if (rt_fatal) {
		static char message[192];
		memcpy(message, "Uncaught ", 9);
		if (is_string(v) || is_error(v))
			to_utf8(rt_any_to_str(v, rootstack_begin), message + 9, sizeof message - 10);
		else
			snprintf(message + 9, sizeof message - 9, "%s", to_ascii(v, buf) ? buf : names[rt_any_typeof(v)]);
		rt_fatal(message);
	}
	fflush(stdout);
	fputs("Uncaught ", stderr);
	if (is_string(v) || is_error(v))
		put_units_to(stderr, rt_any_to_str(v, rootstack_begin));
	else if (to_ascii(v, buf))
		fputs(buf, stderr);
	else
		fputs(names[rt_any_typeof(v)], stderr);
	fputc('\n', stderr);
	exit(2);
}

/* n.toString(radix), as V8 writes it (DoubleToRadixCString): the shortest digits that read
 * back as n, rounding the last one half to even. */
/* Chapter 21: n.toFixed(f) and n.toPrecision(p). JavaScript rounds the exact value of the
   double to the nearest, a tie going to the larger magnitude. glibc's printf writes that exact
   value (a double has at most 1074 fraction digits, 767 significant ones), so the digits come
   from it and the rounding is done here, on decimal digits. */
static int round_digits(char *d, int n, char next)   /* 1 when the carry adds a digit in front */
{
	int k = n - 1;
	if (next < '5') return 0;
	while (k >= 0 && d[k] == '9') d[k--] = '0';
	if (k >= 0) { d[k]++; return 0; }
	memmove(d + 1, d, (size_t)n);
	d[0] = '1';
	return 1;
}
int64_t rt_num_to_fixed(int64_t nb, int64_t db, int64_t *roots)
{
	static char exact[1200], out[1300];
	double x = bits_double(nb), f = bits_double(db);
	int digits, ip, n = 0, o = 0;
	char *dot;
	f = isnan(f) ? 0 : trunc(f);
	if (!(f >= 0 && f <= 100)) return throw_error("RangeError", "toFixed() digits argument must be between 0 and 100", roots);
	if (!isfinite(x) || fabs(x) >= 1e21) return rt_num_to_str(nb, roots);
	digits = (int)f;
	snprintf(exact, sizeof exact, "%.1100f", fabs(x));
	dot = strchr(exact, '.');
	ip = (int)(dot - exact);
	char d[1300];
	for (int k = 0; k < ip; k++) d[n++] = exact[k];
	for (int k = 0; k < digits; k++) d[n++] = dot[1 + k];
	if (round_digits(d, n, dot[1 + digits])) { n++; ip++; }
	if (x < 0) out[o++] = '-';
	for (int k = 0; k < ip; k++) out[o++] = d[k];
	if (digits > 0) { out[o++] = '.'; for (int k = ip; k < n; k++) out[o++] = d[k]; }
	out[o] = 0;
	return string_of_ascii(out, roots);
}
int64_t rt_num_to_precision(int64_t nb, int64_t db, int64_t *roots)
{
	static char exact[1200], out[1300];
	double x = bits_double(nb), f = bits_double(db);
	int p, e, o = 0;
	char d[200];
	f = isnan(f) ? 0 : trunc(f);
	if (!isfinite(x)) return rt_num_to_str(nb, roots);
	if (!(f >= 1 && f <= 100)) return throw_error("RangeError", "toPrecision() argument must be between 1 and 100", roots);
	p = (int)f;
	if (x == 0) {
		memset(d, '0', (size_t)p);
		e = 0;
	} else {
		char *ep;
		snprintf(exact, sizeof exact, "%.1100e", fabs(x));   /* d.ddd...e+XX, exact */
		ep = strchr(exact, 'e');
		e = atoi(ep + 1);
		d[0] = exact[0];
		for (int k = 1; k < p; k++) d[k] = exact[k + 1];
		if (round_digits(d, p, exact[p + 1])) e++;   /* (the digit after the p-th) */
	}
	if (x < 0) out[o++] = '-';
	if (e < -6 || e >= p) {   /* d.ddde+X */
		out[o++] = d[0];
		if (p > 1) { out[o++] = '.'; for (int k = 1; k < p; k++) out[o++] = d[k]; }
		o += sprintf(out + o, "e%c%d", e < 0 ? '-' : '+', e < 0 ? -e : e);
	} else if (e >= 0) {
		for (int k = 0; k <= e; k++) out[o++] = d[k];
		if (e + 1 < p) { out[o++] = '.'; for (int k = e + 1; k < p; k++) out[o++] = d[k]; }
	} else {
		out[o++] = '0'; out[o++] = '.';
		for (int k = 0; k < -(e + 1); k++) out[o++] = '0';
		for (int k = 0; k < p; k++) out[o++] = d[k];
	}
	out[o] = 0;
	return string_of_ascii(out, roots);
}
int64_t rt_num_to_radix(int64_t nb, int64_t rb, int64_t *roots)
{
	static const char chars[] = "0123456789abcdefghijklmnopqrstuvwxyz";
	char buf[2200];
	double value = bits_double(nb), r = bits_double(rb), integer, fraction, delta;
	int radix, ic = 1100, fc = 1100, negative;
	if (!(r >= 2 && r <= 36))
		return throw_error("RangeError", "toString() radix argument must be between 2 and 36", roots);
	radix = (int)r;
	if (radix == 10 || isnan(value) || isinf(value))
		return rt_num_to_str(nb, roots);
	negative = value < 0;
	if (negative)
		value = -value;
	integer = floor(value);
	fraction = value - integer;
	delta = 0.5 * (nextafter(value, INFINITY) - value);
	if (delta < nextafter(0.0, 1.0))
		delta = nextafter(0.0, 1.0);
	if (fraction >= delta) {
		buf[fc++] = '.';
		do {
			int digit;
			fraction *= radix;
			delta *= radix;
			digit = (int)fraction;
			buf[fc++] = chars[digit];
			fraction -= digit;
			if ((fraction > 0.5 || (fraction == 0.5 && (digit & 1))) && fraction + delta > 1) {
				for (;;) {   /* round up, carrying into the integer part if need be */
					int d;
					fc--;
					if (fc == 1100) {
						integer += 1;
						break;
					}
					d = buf[fc] > '9' ? buf[fc] - 'a' + 10 : buf[fc] - '0';
					if (d + 1 < radix) {
						buf[fc++] = chars[d + 1];
						break;
					}
				}
				break;
			}
		} while (fraction >= delta);
	}
	while (integer / radix >= 9007199254740992.0) {   /* digits below the double's precision */
		integer /= radix;
		buf[--ic] = '0';
	}
	do {
		double rem = fmod(integer, radix);
		buf[--ic] = chars[(int)rem];
		integer = (integer - rem) / radix;
	} while (integer > 0);
	if (negative)
		buf[--ic] = '-';
	buf[fc] = '\0';
	return string_of_ascii(buf + ic, roots);
}

/* ---- chapter 15: arrays that grow ----------------------------------------------------------
 * a.length = n. Within the storage's capacity only the length changes; beyond it, a new
 * storage of twice the capacity (or n) takes the elements. New slots get `fill` (undefined
 * for an Any[], 0 for numbers). Not a valid length: a RangeError. */
static int is_array(int64_t w)
{
	return is_pointer(w) && kind_of(((int64_t *)w)[0]) == 2 && ((((int64_t *)w)[0] >> 51) & 3) == 3;
}
int64_t rt_arr_resize(int64_t a, int64_t n, int64_t fill, int64_t *roots)
{
	int64_t old = arr_len(a), *st = (int64_t *)((int64_t *)a)[2], cap = st[0] >> 3;
	if (n < 0 || n >= 4294967296LL)
		return throw_error("RangeError", "Invalid array length", roots);
	if (n > cap) {
		int64_t keep[2] = { a, fill }, size = cap * 2 > n ? cap * 2 : n, *ns;
		if (size < 4) size = 4;
		ns = alloc_words(size, roots, keep, 2);
		a = keep[0];
		fill = keep[1];
		st = (int64_t *)((int64_t *)a)[2];
		ns[0] = size << 3 | (st[0] & 6) | 1;   /* the same kind: pointers or not */
		memcpy(ns + 1, st + 1, (size_t)old * 8);
		for (int64_t k = old; k < size; k++)
			ns[k + 1] = 0;
		((int64_t *)a)[2] = (int64_t)ns;
		st = ns;
	}
	for (int64_t k = old; k < n; k++)
		st[k + 1] = fill;
	((int64_t *)a)[1] = n;
	return n;
}
int64_t rt_any_is_array(int64_t a) { return is_array(a); }
int64_t rt_any_length(int64_t a)
{
	if (is_string(a) || is_array(a)) return ((int64_t *)a)[1];
	if (is_record(a)) {   /* CJI-3: an object's length property (a typed array's) */
		int64_t v = rt_any_get(a, word_string("length"));
		if (is_number(v) && to_double(v) == floor(to_double(v)) && fabs(to_double(v)) <= 9007199254740991.0)
			return (int64_t)to_double(v);
	}
	if (a == ANY_NULL || a == ANY_UNDEFINED) { throw_null_read(a, word_string("length")); return 0; }   /* chapter 24 */
	type_error("type error: expected an array");
	return 0;
}
/* chapter 16: the number of parameters of a function value (0 for anything else) */
/* Chapter 20: a typed read of a dynamic field: HOLE, a field the object lacks, is undefined. */
int64_t rt_any_unhole(int64_t v) { return v == ANY_HOLE ? ANY_UNDEFINED : v; }
int64_t rt_any_arity(int64_t a)
{
	if (!is_pointer(a) || kind_of(((int64_t *)a)[0]) != 2 || (((int64_t *)a)[0] >> 52 & 1)) return 0;
	return arity_of(((int64_t *)a)[0]);
}

/* ---- Chapter 24: a native world's system calls -------------------------------------------------------------
 * A world compiled for picocalc-os reaches the kernel through one function, the native interface's call
 * (picocalc-os sdk/nw_wire.h numbers the operations). host_arg sets its arguments: k = 0, 1, 2 a string as
 * UTF-8, k = 3 the number c, k = 4 string 0 as bytes (each unit's low byte, for I2C). host_call makes the call
 * and gives back its text, or its number when it has no text; op -1 gives the last failure's text.
 * host_event reads the event being handled. The embedder (runtime/nw_world.c) sets rt_kernel_call,
 * rt_kernel_error and rt_event; anywhere else a host call stops the program. */
rt_kernel_call_fn rt_kernel_call;
rt_kernel_error_fn rt_kernel_error;
rt_event_t rt_event;
#define HOST_STR_MAX 65536
/* (chapter 25: the arguments' buffers grow to the longest string a world has passed, and a text
   result's buffer exists only during the call: a world has a memory limit) */
static char *host_s[3];
static size_t host_n[3], host_cap[3];
static char *host_buf(int k, size_t n)
{
	if (n + 1 > host_cap[k]) {
		host_cap[k] = n + 1 < 256 ? 256 : n + 1;
		host_s[k] = rt_realloc(host_s[k], host_cap[k]);
		if (!host_s[k]) { world_fatal("out of memory"); fprintf(stderr, "out of memory\n"); exit(3); }
	}
	return host_s[k];
}
/* the UTF-8 length of a string */
static size_t utf8_len(int64_t s)
{
	const uint16_t *u = units(s);
	size_t n = 0;
	for (int64_t k = 0, len = slen(s); k < len; k++) n += u[k] < 0x80 ? 1 : u[k] < 0x800 ? 2 : 3;
	return n;
}
static int host_set[3];
static int64_t host_c;

static size_t to_utf8(int64_t s, char *out, size_t max)
{
	const uint16_t *u = units(s);
	size_t n = 0;
	for (int64_t k = 0, len = slen(s); k < len; k++) {
		uint32_t c = u[k];
		if (c >= 0xd800 && c < 0xdc00 && k + 1 < len && u[k + 1] >= 0xdc00 && u[k + 1] < 0xe000)
			c = 0x10000 + ((c - 0xd800) << 10) + (u[++k] - 0xdc00);
		else if (c >= 0xd800 && c < 0xe000)
			c = 0xfffd;
		if (n + 4 > max) break;
		if (c < 0x80) out[n++] = (char)c;
		else if (c < 0x800) { out[n++] = (char)(0xc0 | (c >> 6)); out[n++] = (char)(0x80 | (c & 0x3f)); }
		else if (c < 0x10000) { out[n++] = (char)(0xe0 | (c >> 12)); out[n++] = (char)(0x80 | ((c >> 6) & 0x3f)); out[n++] = (char)(0x80 | (c & 0x3f)); }
		else { out[n++] = (char)(0xf0 | (c >> 18)); out[n++] = (char)(0x80 | ((c >> 12) & 0x3f)); out[n++] = (char)(0x80 | ((c >> 6) & 0x3f)); out[n++] = (char)(0x80 | (c & 0x3f)); }
	}
	out[n] = '\0';
	return n;
}
/* UTF-8 (as the kernel writes it) to a new string; a malformed byte is U+FFFD */
static int64_t string_of_utf8(const char *s, size_t n, int64_t *roots)
{
	uint16_t *u = rt_malloc((n + 1) * 2);
	int64_t m = 0, r;
	if (!u) { world_fatal("out of memory"); fprintf(stderr, "out of memory\n"); exit(3); }
	for (size_t k = 0; k < n;) {
		unsigned char b = (unsigned char)s[k];
		uint32_t c;
		int len = b < 0x80 ? 1 : (b >> 5) == 6 ? 2 : (b >> 4) == 14 ? 3 : (b >> 3) == 30 ? 4 : 0;
		if (len == 0 || k + (size_t)len > n) { u[m++] = 0xfffd; k++; continue; }
		c = len == 1 ? b : len == 2 ? b & 0x1f : len == 3 ? b & 0x0f : b & 0x07;
		for (int j = 1; j < len; j++) c = c << 6 | ((unsigned char)s[k + (size_t)j] & 0x3f);
		k += (size_t)len;
		if (c >= 0x10000) { c -= 0x10000; u[m++] = (uint16_t)(0xd800 + (c >> 10)); u[m++] = (uint16_t)(0xdc00 + (c & 0x3ff)); }
		else u[m++] = (uint16_t)c;
	}
	r = string_of(u, m, roots);
	rt_free(u);
	return r;
}
int64_t rt_host_arg(int64_t k, int64_t v)
{
	char buf[64];
	if (k == 3) { host_c = is_number(v) ? (int64_t)to_double(v) : 0; return 0; }
	if (k >= 5 && k <= 8) {
		int32_t coord = is_number(v) ? (int32_t)to_double(v) : 0;
		memcpy(host_buf(0, 16) + 4 * (k - 5), &coord, sizeof coord);
		host_n[0] = 16; host_set[0] = 1;
		return 0;
	}
	if (k == 9 && is_string(v)) {
		/* A color appended to a drawing packet is a short ASCII RGB literal. */
		size_t n = (size_t)slen(v);
		if (n > 7) n = 7;
		char *dst = host_buf(0, 16 + n);
		for (size_t i = 0; i < n; i++) dst[16+i] = (char)(units(v)[i] & 127);
		host_n[0] = 16 + n;
		return 0;
	}
	if (k == 4) {   /* bytes */
		const uint16_t *u = is_string(v) ? units(v) : NULL;
		int64_t n = u ? slen(v) : 0;
		if (n > HOST_STR_MAX) n = HOST_STR_MAX;
		host_buf(0, (size_t)n);
		for (int64_t i = 0; i < n; i++) host_s[0][i] = (char)(u[i] & 0xff);
		host_n[0] = (size_t)n; host_set[0] = 1;
		return 0;
	}
	if (k < 0 || k > 2) return 0;
	host_set[k] = !(v == ANY_UNDEFINED || v == ANY_NULL);
	if (!host_set[k]) { host_n[k] = 0; host_buf(k, 0)[0] = '\0'; }
	else if (is_string(v)) host_n[k] = to_utf8(v, host_buf(k, utf8_len(v) + 4), utf8_len(v) + 4);
	else if (to_ascii(v, buf)) { host_n[k] = strlen(buf); memcpy(host_buf(k, host_n[k]), buf, host_n[k] + 1); }
	else { host_n[k] = 0; host_buf(k, 0)[0] = '\0'; }
	return 0;
}
int64_t rt_host_call(int64_t op, int64_t a, int64_t b, int64_t *roots)
{
	/* (chapter 26) only a store's text (17) and an error's (-1) can be long: the other calls answer
	   with a number or a world's name, in a buffer on the stack */
	char small[256], *out = small;
	size_t cap = op == 17 || op == 1030 || op == 1037 || op == -1 ? HOST_STR_MAX + 1 :
		(op == 25 || op == 27 || op == 1031 || op == 1033 || op == 1035 || op == 1019 ? 16384 : sizeof small); /* net info and scan result */
	int64_t r, result;
	if (!rt_kernel_call)
		type_error("host calls run only in a world inside picocalc-os");
	if (cap > sizeof small && !(out = rt_malloc(cap))) { world_fatal("out of memory"); fprintf(stderr, "out of memory\n"); exit(3); }
	out[0] = '\0';
	if (op == -1)
		r = rt_kernel_error ? rt_kernel_error(out, cap) : 0;
	else
		r = rt_kernel_call((int)op, (int)a, (int)b, host_c, host_set[0] ? host_s[0] : NULL, host_n[0],
			host_set[1] ? host_s[1] : NULL, host_n[1], host_set[2] ? host_s[2] : NULL, host_n[2], out, cap);
	for (int k = 0; k < 3; k++) { host_set[k] = 0; host_n[k] = 0; }
	host_c = 0;
	result = (op == -1 || r >= 0) && out[0] ? string_of_utf8(out, strlen(out), roots) : from_double((double)r);
	if (out != small) rt_free(out);
	return result;
}
/* 0 kind, 1 type, 2 payload (JSON text), 3 from, 4 ask or ok, 5 timer, 6 token, 7 the world's seed */
int64_t rt_host_event(int64_t i, int64_t *roots)
{
	const char *s = i == 1 ? rt_event.type : i == 2 ? rt_event.json : i == 3 ? rt_event.from : NULL;
	if (i == 2 && s) return string_of_utf8(s, (size_t)rt_event.json_len, roots);
	if (s) return string_of_utf8(s, strlen(s), roots);
	if (i == 1 || i == 2 || i == 3) return ANY_UNDEFINED;
	return from_double(i == 0 ? rt_event.kind : i == 4 ? rt_event.second : i == 5 ? rt_event.timer : i == 6 ? rt_event.token
		: i == 7 ? (double)rt_event.seed : 0);
}
int64_t rt_host_entries(int64_t init, int64_t event)
{
	rt_entries[0] = is_pointer(init) ? init : 0;
	rt_entries[1] = is_pointer(event) ? event : 0;
	return 0;
}

/* ---- chapter 28: one runtime, several worlds (runtime.h) --------------------------------------
 * (The runtime also keeps static strings it made for words and for TypeErrors, which every
 * world may share, and scratch buffers no call keeps across a return.) */
void rt_state_init(struct rt_state *s)
{
	memset(s, 0, sizeof *s);
	s->virtual_clock = NAN;
	s->mem_malloc = malloc;   /* CJI-4 */
	s->mem_realloc = realloc;
	s->mem_free = free;
}
#define SWAP(a, b) do { __typeof__(a) t_ = (a); (a) = (b); (b) = t_; } while (0)
void rt_swap(struct rt_state *s)
{
	SWAP(free_ptr, s->free_ptr);
	SWAP(fromspace_begin, s->fromspace_begin);
	SWAP(fromspace_end, s->fromspace_end);
	SWAP(rootstack_begin, s->rootstack_begin);
	SWAP(rootstack_end, s->rootstack_end);
	SWAP(rt_entries[0], s->entries[0]);
	SWAP(rt_entries[1], s->entries[1]);
	SWAP(rt_exports[0], s->exports[0]);   /* CJI-3 */
	SWAP(rt_exports[1], s->exports[1]);
	SWAP(rt_collections, s->collections);
	SWAP(rt_copied_bytes, s->copied_bytes);
	SWAP(exc_flag, s->exc_flag);
	SWAP(exc_value, s->exc_value);
	SWAP(virtual_clock, s->virtual_clock);
	SWAP(rt_kernel_call, s->kernel_call);
	SWAP(rt_kernel_error, s->kernel_error);
	SWAP(rt_event, s->event);
	for (int k = 0; k < 3; k++) {
		SWAP(host_s[k], s->host_s[k]);
		SWAP(host_n[k], s->host_n[k]);
		SWAP(host_cap[k], s->host_cap[k]);
		SWAP(host_set[k], s->host_set[k]);
	}
	SWAP(host_c, s->host_c);
	SWAP(rt_malloc, s->mem_malloc);   /* CJI-4 */
	SWAP(rt_realloc, s->mem_realloc);
	SWAP(rt_free, s->mem_free);
}

/* ---- chapter 31: native primitives -------------------------------------------------------
 *
 * A native primitive is a library function written twice: in the subset, as its reference
 * definition, which every stage's interpreter runs, and here in C, which slas assembles in its
 * place (a function named $nat_NAME becomes a call of rt_NAME). The two need not compute the
 * same value, only values the library's code treats alike: a hash is a hash.
 *
 * rt_key_hash: a Map's or Set's key (as a dynamic value) hashed as SameValueZero compares:
 * a string by its code units, a number by its double with -0 as 0 and every NaN as one, true,
 * false, null and undefined by their words. In [0, 2^30). Any other object is hashed by its
 * address, which a collection changes: such a hash is returned as -1 - h, so that the caller
 * knows to rebuild its index when rt_gc_epoch has moved on. */
int64_t rt_key_hash(int64_t k)
{
	uint64_t h;
	if (is_string(k)) {
		const uint16_t *u = units(k);
		int64_t n = slen(k);
		h = 1469598103934665603ULL;   /* FNV-1a over the code units */
		for (int64_t i = 0; i < n; i++) {
			h ^= u[i];
			h *= 1099511628211ULL;
		}
	} else if (is_pointer(k)) {
		h = ((uint64_t)k >> 3) * 0x9E3779B97F4A7C15ULL;
		return -1 - (int64_t)((h >> 32) & 0x3fffffff);
	} else {
		if (is_number(k)) {   /* -0 as 0, and every NaN as the one from_double makes (0/0 in */
			uint64_t b = (uint64_t)k - DOUBLE_OFFSET;   /* compiled code is another NaN's bits) */
			if (b == NEG_ZERO_BITS)   /* (CJI-3: by the bits) */
				b = 0;
			else if ((b & 0x7fffffffffffffffULL) > 0x7ff0000000000000ULL)
				b = 0x7ff8000000000000ULL;
			k = (int64_t)(b + DOUBLE_OFFSET);
		}
		h = (uint64_t)k;
	}
	h ^= h >> 33;   /* MurmurHash3's finaliser: every bit of the word reaches the low ones (a small */
	h *= 0xff51afd7ed558ccdULL;   /* integer's double has 32 zero bits at the bottom) */
	h ^= h >> 33;
	h *= 0xc4ceb9fe1a85ec53ULL;
	h ^= h >> 33;
	return (int64_t)(h & 0x3fffffff);
}

/* CJI-3: may the code unit u, above U+007F, start an identifier (cont 0, \p{ID_Start}) or continue
 * one (cont 1, \p{ID_Continue})? The lexer's question, from idtable.h (tools/gen-idtable.mjs);
 * src/idchar.js is the reference definition, on the same table. */
int64_t rt_id_char(int64_t u, int64_t cont)
{
	const uint16_t (*r)[2] = cont == 1 ? id_continue : id_start;
	int64_t lo = 0, hi = (cont == 1 ? (int64_t)(sizeof id_continue / sizeof *id_continue) : (int64_t)(sizeof id_start / sizeof *id_start)) - 1;
	if (u < 128)
		return 0;
	while (lo <= hi) {
		int64_t mid = (lo + hi) >> 1;
		if (u < r[mid][0])
			hi = mid - 1;
		else if (u > r[mid][1])
			lo = mid + 1;
		else
			return 1;
	}
	return 0;
}

/* the collections so far: an object's address is the same while this is */
int64_t rt_gc_epoch(void)
{
	return rt_epoch_base + rt_collections;
}

/* CJI-3: a unit compiled on its own. The world runtime is compiled once; its start ends by handing
 * the values worlds use to rt_export (an Any[]: record 0 its own names, record 1 the async library's
 * functions, whose job queue must be one), and a world's start reads each one by record and index.
 * Both are native primitives ($nat_export, $nat_import). */
int64_t rt_export(int64_t r, int64_t record)
{
	if (r < 0 || r > 1)
		type_error("type error: there are two export records");
	rt_exports[r] = record;
	return ANY_UNDEFINED;
}
int64_t rt_import(int64_t r, int64_t k)
{
	int64_t x = r >= 0 && r <= 1 ? rt_exports[r] : 0;
	if (!is_array(x) || k < 0 || k >= arr_len(x))
		type_error("type error: no export record to import from (a world compiled on its own needs its runtime's unit)");
	return arr_elems(x)[k];
}

/* CJI-3, step 6: the stage-1 compiler (the cji-target bundle compiled by cji) as a native program.
 * Its main is $nat_write_output(compileSource($nat_read_input(), $nat_arg_flag('--native'), ...));
 * these are the primitives' C bodies (tools/bundle.mjs holds their reference definitions), and
 * rt_double_bits is src/words.js's $nat_double_bits. The program's own arguments are the ones
 * after slas's `--` (or after aot_main's options): a file to compile (none, or -, is stdin), and
 * flags: --native for a world, --world-unit, --prelude-unit, --spill. */
int rt_argc;
char **rt_argv;

int64_t rt_arg_native(void)
{
	for (int i = 0; i < rt_argc; i++)
		if (!strcmp(rt_argv[i], "--native"))
			return 1;
	return 0;
}
/* is the flag `name` (a string) among the program's arguments? */
int64_t rt_arg_flag(int64_t name)
{
	for (int i = 0; i < rt_argc; i++) {
		int64_t n = (int64_t)strlen(rt_argv[i]), k = 0;
		if (n != slen(name))
			continue;
		while (k < n && units(name)[k] == (uint16_t)(unsigned char)rt_argv[i][k])
			k++;
		if (k == n)
			return 1;
	}
	return 0;
}

/* --stats: after each pass (and once at the start), a full collection, and the bytes live then
 * written to stderr with the pass's name and time: "pass NAME: N ms, live L bytes, heap H bytes". */
int64_t rt_pass_live(int64_t name, int64_t ms, int64_t *roots)
{
	int64_t live;
	roots[0] = name;
	rt_collect((int64_t **)(roots + 1), 0);
	name = roots[0];
	live = (free_ptr - fromspace_begin) * 8;
	fputs("pass ", stderr);
	put_units_to(stderr, name);
	fprintf(stderr, ": %lld ms, live %lld bytes, heap %lld bytes\n", (long long)ms, (long long)live, (long long)((fromspace_end - fromspace_begin) * 8));
	return live;
}

/* Spilling (src/spill.js): the stage-1 compiler's file store. Each text is appended to one
 * temporary file as its UTF-16 units; the runtime keeps each one's offset and length, the
 * compiler only its number. rt_spill_bytes counts what was written (slas -g, aot_main -g). */
static FILE *spill_file;
static int64_t *spill_at, *spill_len, spill_n, spill_cap, spill_end;
int64_t rt_spill_bytes;
int64_t rt_spill_put(int64_t s)
{
	int64_t n = slen(s);
	if (!spill_file && !(spill_file = tmpfile())) {
		perror("spill");
		exit(3);
	}
	if (spill_n == spill_cap) {
		spill_cap = spill_cap ? 2 * spill_cap : 1024;
		spill_at = realloc(spill_at, (size_t)spill_cap * sizeof *spill_at);
		spill_len = realloc(spill_len, (size_t)spill_cap * sizeof *spill_len);
		if (!spill_at || !spill_len) { fprintf(stderr, "out of memory\n"); exit(3); }
	}
	if (fseek(spill_file, spill_end, SEEK_SET) || (int64_t)fwrite(units(s), 2, (size_t)n, spill_file) != n) {
		perror("spill");
		exit(3);
	}
	spill_at[spill_n] = spill_end;
	spill_len[spill_n] = n;
	spill_end += 2 * n;
	rt_spill_bytes += 2 * n;
	return spill_n++;
}
void rt_spill_reset(void)   /* (CJI-4: a firmware that compiles again frees what the last compile spilled) */
{
	if (spill_file)
		fclose(spill_file);
	free(spill_at);
	free(spill_len);
	spill_file = NULL;
	spill_at = spill_len = NULL;
	spill_n = spill_cap = spill_end = 0;
}
int64_t rt_spill_get(int64_t id, int64_t *roots)
{
	int64_t n, *p;
	if (id < 0 || id >= spill_n)
		type_error("type error: no spilled text with that number");
	n = spill_len[id];
	p = new_string(n, roots, NULL, 0);
	if (fseek(spill_file, spill_at[id], SEEK_SET) || (int64_t)fread(p + 2, 2, (size_t)n, spill_file) != n) {
		perror("spill");
		exit(3);
	}
	return (int64_t)p;
}

/* the text of the file named (none, or -, is stdin), decoded from UTF-8 as Node's
   readFileSync(f, 'utf8') does it (a malformed byte is U+FFFD) */
static int64_t read_named(const char *name, int64_t *roots)
{
	FILE *f;
	char *text = NULL;
	size_t len = 0, cap = 0, got;
	int64_t s;
	f = !name || !strcmp(name, "-") ? stdin : fopen(name, "rb");
	if (!f) {
		perror(name);
		exit(2);
	}
	do {
		if (len + 65536 > cap && !(text = realloc(text, cap = 2 * cap + 65536))) {
			fprintf(stderr, "out of memory\n");
			exit(3);
		}
		got = fread(text + len, 1, 65536, f);
		len += got;
	} while (got);
	if (f != stdin)
		fclose(f);
	s = string_of_utf8(text, len, roots);
	free(text);
	return s;
}
/* the input: the file named by the first argument that is not a flag */
int64_t rt_read_input(int64_t *roots)
{
	const char *name = NULL;
	for (int i = 0; i < rt_argc && !name; i++)
		if (!strcmp(rt_argv[i], "--driver"))
			i++;   /* (its value is the harness script's file) */
		else if (strncmp(rt_argv[i], "--", 2))
			name = rt_argv[i];
	return read_named(name, roots);
}
/* (a world's harness script, --driver FILE) a file named by a string */
int64_t rt_read_file(int64_t path, int64_t *roots)
{
	char *name = malloc((size_t)slen(path) * 4 + 8);
	int64_t s;
	if (!name) { fprintf(stderr, "out of memory\n"); exit(3); }
	to_utf8(path, name, (size_t)slen(path) * 4 + 8);
	s = read_named(name, roots);
	free(name);
	return s;
}
/* the argument after the flag `name` (a string), or the empty string */
int64_t rt_arg_value(int64_t name, int64_t *roots)
{
	for (int i = 0; i + 1 < rt_argc; i++) {
		int64_t n = (int64_t)strlen(rt_argv[i]), k = 0;
		if (n != slen(name))
			continue;
		while (k < n && units(name)[k] == (uint16_t)(unsigned char)rt_argv[i][k])
			k++;
		if (k == n)
			return string_of_utf8(rt_argv[i + 1], strlen(rt_argv[i + 1]), roots);
	}
	return string_of_utf8("", 0, roots);
}

/* s written to standard output as UTF-8 (a lone surrogate as U+FFFD, as Node writes it) */
int64_t rt_write_output(int64_t s)
{
	put_units_to(stdout, s);
	return slen(s);
}

/* the decimal of the signed 64-bit word that is the bits of the double d (the one NaN for any
   NaN) plus high * 2^32, mod 2^64 */
int64_t rt_double_bits(int64_t d, int64_t high, int64_t *roots)
{
	char buf[32];
	double x = bits_double(d);
	uint64_t w = x != x ? 0x7ff8000000000000ULL : (uint64_t)d;
	w += (uint64_t)high << 32;
	snprintf(buf, sizeof buf, "%lld", (long long)(int64_t)w);
	return string_of_ascii(buf, roots);
}

/* ---- CJI-3, lane 6: packed sets, integer vectors and the interference graph -------------------
 * The C bodies of src/bitsets.js's native primitives (the reference definitions are there). The
 * values are kind-0 objects, which the collector copies without looking inside, except the graph,
 * a kind-1 object (every field a pointer) of its table and its chunks of tiles.
 *
 * A set of `words` 32-bit words: [header, words, the words two to a heap word]. An integer vector of
 * n: [header, n, the 32-bit integers two to a heap word].
 *
 * The graph keeps the lower triangle of its bit matrix (an edge u-v at row max(u, v), column
 * min(u, v)) in tiles of 32 rows by one 32-bit word: tile (R, C), C <= R, holds rows 32R .. 32R + 31,
 * columns 32C .. 32C + 31, and exists only once an edge falls in it. Locations are numbered in the
 * order the code first mentions them, so those alive together are mostly close: for agent's largest
 * function (4877 locations) 3652 of the 11781 tiles of the triangle hold an edge, 0.47 MB, where the
 * whole matrix as a Uint32Array took 5.97 MB in cji (8 bytes an element). The graph object is
 * [header, table, chunk 0, chunk 1, ...]: the table (kind 0) is [header, n, T = tile rows, tiles so
 * far, tiles a chunk, chunks so far, then for each tile (R, C) at R(R+1)/2 + C its number + 1, or 0,
 * as 32-bit integers]; a chunk (kind 0) holds `tiles a chunk` tiles of 32 words, its slot 0 until
 * the tiles reach it. Adding edges first numbers the tiles they need, then allocates the chunks
 * those tiles fall in (where a collection may move everything), then sets the bits. */
#define OBJ(w) ((int64_t *)(intptr_t)(w))
#define WORD_OF(p) ((int64_t)(intptr_t)(p))
static int64_t *new_kind0(int64_t fields, int64_t *roots, int64_t *keep, int nkeep)
{
	int64_t *p = alloc_words(fields, roots, keep, nkeep);
	p[0] = fields << 3 | 1;
	memset(p + 1, 0, (size_t)fields * 8);
	return p;
}
static int64_t bits_words(int64_t s) { return OBJ(s)[1]; }
static uint32_t *bits_at(int64_t s) { return (uint32_t *)(OBJ(s) + 2); }
static int64_t new_bits(int64_t words, int64_t *roots, int64_t *keep, int nkeep)
{
	int64_t *p = new_kind0(1 + (words + 1) / 2, roots, keep, nkeep);
	p[1] = words;
	return WORD_OF(p);
}
int64_t rt_bits_new(int64_t words, int64_t *roots) { return new_bits(words < 0 ? 0 : words, roots, NULL, 0); }
int64_t rt_bits_words(int64_t s) { return bits_words(s); }
int64_t rt_bits_has(int64_t s, int64_t x)
{
	return x >= 0 && (x >> 5) < bits_words(s) && (bits_at(s)[x >> 5] >> (x & 31) & 1);
}
int64_t rt_bits_add(int64_t s, int64_t x)
{
	if (x >= 0 && (x >> 5) < bits_words(s)) bits_at(s)[x >> 5] |= 1u << (x & 31);   /* (past the end: ignored, as JavaScript does) */
	return 0;
}
int64_t rt_bits_remove(int64_t s, int64_t x)
{
	if (x >= 0 && (x >> 5) < bits_words(s)) bits_at(s)[x >> 5] &= ~(1u << (x & 31));
	return 0;
}
int64_t rt_bits_or(int64_t d, int64_t s)
{
	int64_t n = bits_words(d) < bits_words(s) ? bits_words(d) : bits_words(s);
	uint32_t *a = bits_at(d), *b = bits_at(s);
	for (int64_t w = 0; w < n; w++) a[w] |= b[w];
	return 0;
}
int64_t rt_bits_and(int64_t d, int64_t s, int64_t m)
{
	int64_t n = bits_words(d), ns = bits_words(s), nm = bits_words(m);
	uint32_t *a = bits_at(d), *b = bits_at(s), *c = bits_at(m);
	for (int64_t w = 0; w < n; w++) a[w] = (w < ns ? b[w] : 0) & (w < nm ? c[w] : 0);
	return 0;
}
int64_t rt_bits_equal(int64_t a, int64_t b)
{
	int64_t n = bits_words(a);
	if (bits_words(b) < n) return 0;
	return !memcmp(bits_at(a), bits_at(b), (size_t)n * 4);
}
int64_t rt_bits_next(int64_t s, int64_t from)
{
	int64_t n = bits_words(s), w = from >> 5;
	uint32_t *a = bits_at(s), x;
	if (from < 0 || w >= n) return -1;
	x = a[w] & ~((1u << (from & 31)) - 1);
	for (;;) {
		if (x) return w << 5 | __builtin_ctz(x);
		if (++w >= n) return -1;
		x = a[w];
	}
}
int64_t rt_bits_first_free(int64_t s)
{
	int64_t n = bits_words(s), w = 0;
	uint32_t *a = bits_at(s);
	while (w < n && a[w] == 0xffffffffu) w++;
	return w == n ? w << 5 : w << 5 | __builtin_ctz(~a[w]);
}
int64_t rt_bits_grow(int64_t s, int64_t words, int64_t *roots)
{
	int64_t keep[1] = { s }, t, n;
	if (words < bits_words(s)) words = bits_words(s);
	t = new_bits(words, roots, keep, 1);
	s = keep[0];
	n = bits_words(s);
	memcpy(bits_at(t), bits_at(s), (size_t)n * 4);
	return t;
}

int64_t rt_ints_new(int64_t n, int64_t *roots)
{
	int64_t *p;
	if (n < 0) n = 0;
	p = new_kind0(1 + (n + 1) / 2, roots, NULL, 0);
	p[1] = n;
	return WORD_OF(p);
}
static int32_t *ints_at(int64_t a) { return (int32_t *)(OBJ(a) + 2); }
int64_t rt_ints_length(int64_t a) { return OBJ(a)[1]; }
int64_t rt_ints_get(int64_t a, int64_t i)
{
	if (i < 0 || i >= OBJ(a)[1]) rt_index_error();
	return ints_at(a)[i];
}
int64_t rt_ints_set(int64_t a, int64_t i, int64_t v)
{
	if (i >= 0 && i < OBJ(a)[1]) ints_at(a)[i] = (int32_t)v;
	return 0;
}

/* s plus (add_all) or minus (remove_all) the integers a[p + 1] .. a[p + a[p]]; p + 1 + a[p] */
int64_t rt_bits_add_all(int64_t s, int64_t a, int64_t p)
{
	int32_t *d = ints_at(a);
	int64_t n = d[p], words = bits_words(s);
	uint32_t *l = bits_at(s);
	for (int64_t j = 1; j <= n; j++)
		if (d[p + j] >= 0 && (d[p + j] >> 5) < words) l[d[p + j] >> 5] |= 1u << (d[p + j] & 31);
	return p + 1 + n;
}
int64_t rt_bits_remove_all(int64_t s, int64_t a, int64_t p)
{
	int32_t *d = ints_at(a);
	int64_t n = d[p], words = bits_words(s);
	uint32_t *l = bits_at(s);
	for (int64_t j = 1; j <= n; j++)
		if (d[p + j] >= 0 && (d[p + j] >> 5) < words) l[d[p + j] >> 5] &= ~(1u << (d[p + j] & 31));
	return p + 1 + n;
}

enum { G_N = 1, G_T, G_TILES, G_TPC, G_CHUNKS, G_INDEX };   /* the graph table's fields */
static int64_t *graph_table(int64_t g) { return OBJ(OBJ(g)[1]); }
static int32_t *graph_index(int64_t g) { return (int32_t *)(graph_table(g) + G_INDEX); }
static uint32_t *graph_tile(int64_t g, int64_t k)   /* tile number k's 32 words */
{
	int64_t tpc = graph_table(g)[G_TPC];
	return (uint32_t *)(OBJ(OBJ(g)[2 + k / tpc]) + 1) + (k % tpc) * 32;
}
int64_t rt_graph_new(int64_t n, int64_t *roots)
{
	int64_t t = (n + 31) >> 5, slots = t * (t + 1) / 2, tpc = slots < 64 ? (slots ? slots : 1) : 64;
	int64_t chunks = (slots + tpc - 1) / tpc, *table, *g, keep[1];
	table = new_kind0(G_INDEX - 1 + (slots + 1) / 2, roots, NULL, 0);
	table[G_N] = n;
	table[G_T] = t;
	table[G_TPC] = tpc;
	keep[0] = WORD_OF(table);
	g = alloc_words(1 + chunks, roots, keep, 1);
	g[0] = (1 + chunks) << 3 | 1 << 1 | 1;   /* kind 1: every field a pointer (or 0) */
	g[1] = keep[0];
	memset(g + 2, 0, (size_t)chunks * 8);
	return WORD_OF(g);
}
/* The edges d-v for v in live but d, tile by tile. pass 0: number the tiles they need; pass 1: set
   their bits (every tile numbered and its chunk allocated). */
static void graph_mark(int64_t g, int64_t R, int64_t C, int64_t row, uint32_t mask, int pass)
{
	int32_t *index = graph_index(g);
	int64_t slot = R * (R + 1) / 2 + C;
	if (pass == 0) {
		if (!index[slot]) index[slot] = (int32_t)++graph_table(g)[G_TILES];
	} else
		graph_tile(g, index[slot] - 1)[row] |= mask;
}
static void graph_edges(int64_t g, int64_t d, int64_t live, int pass)
{
	int64_t n = bits_words(live), rd = d >> 5, bd = d & 31;
	uint32_t *l = bits_at(live);
	for (int64_t c = 0; c < n; c++) {
		uint32_t m = l[c];
		if (!m) continue;
		if (c < rd)   /* every v here is below d: d's own row */
			graph_mark(g, rd, c, bd, m, pass);
		else if (c == rd) {   /* the diagonal tile: v below d in d's row, v above d in v's */
			uint32_t below = m & ((1u << bd) - 1), above = m & ~((2u << bd) - 1);
			if (below) graph_mark(g, rd, rd, bd, below, pass);
			for (; above; above &= above - 1)
				graph_mark(g, rd, rd, __builtin_ctz(above), 1u << bd, pass);
		} else   /* every v here is above d: d's column in v's row */
			for (; m; m &= m - 1)
				graph_mark(g, c, rd, __builtin_ctz(m), 1u << bd, pass);
	}
}
/* the chunks for every tile numbered so far (keep[0] the graph; a collection may move keep[]) */
static void graph_chunks(int64_t *roots, int64_t *keep, int nkeep)
{
	for (;;) {
		int64_t *table = graph_table(keep[0]), *c;
		if (table[G_CHUNKS] * table[G_TPC] >= table[G_TILES]) return;
		c = new_kind0(table[G_TPC] * 16, roots, keep, nkeep);
		table = graph_table(keep[0]);
		OBJ(keep[0])[2 + table[G_CHUNKS]] = WORD_OF(c);
		table[G_CHUNKS]++;
	}
}
int64_t rt_graph_add_live(int64_t g, int64_t d, int64_t live, int64_t *roots)
{
	int64_t keep[2] = { g, live };
	graph_edges(g, d, live, 0);
	graph_chunks(roots, keep, 2);
	graph_edges(keep[0], d, keep[1], 1);
	return 0;
}
int64_t rt_graph_add_cross(int64_t g, int64_t a, int64_t b, int64_t *roots)
{
	int64_t keep[3] = { g, a, b };
	for (int64_t u = rt_bits_next(a, 0); u >= 0; u = rt_bits_next(a, u + 1))
		graph_edges(g, u, b, 0);
	graph_chunks(roots, keep, 3);
	for (int64_t u = rt_bits_next(keep[1], 0); u >= 0; u = rt_bits_next(keep[1], u + 1))
		graph_edges(keep[0], u, keep[2], 1);
	return 0;
}
/* word c of u's row: from u's own row below the diagonal tile, from u's column at and after it */
static uint32_t graph_word(int64_t g, int64_t u, int64_t c)
{
	int32_t *index = graph_index(g);
	int64_t ru = u >> 5, bu = u & 31, k;
	uint32_t w = 0, *tile;
	if (c < ru) {
		k = index[ru * (ru + 1) / 2 + c];
		return k ? graph_tile(g, k - 1)[bu] : 0;
	}
	k = index[c * (c + 1) / 2 + ru];
	if (!k) return 0;
	tile = graph_tile(g, k - 1);
	if (c == ru) w = tile[bu];   /* (only bits below bu are ever set in u's own row here) */
	for (int64_t i = c == ru ? bu + 1 : 0; i < 32; i++)
		w |= (tile[i] >> bu & 1) << i;
	return w;
}
int64_t rt_graph_row(int64_t g, int64_t u, int64_t out)
{
	int64_t n = bits_words(out), t = graph_table(g)[G_T];
	uint32_t *o = bits_at(out);
	for (int64_t c = 0; c < n; c++)
		o[c] = c < t ? graph_word(g, u, c) : 0;
	return 0;
}
int64_t rt_graph_word(int64_t g, int64_t u, int64_t w)
{
	return w >= 0 && w < graph_table(g)[G_T] ? (int32_t)graph_word(g, u, w) : 0;
}
