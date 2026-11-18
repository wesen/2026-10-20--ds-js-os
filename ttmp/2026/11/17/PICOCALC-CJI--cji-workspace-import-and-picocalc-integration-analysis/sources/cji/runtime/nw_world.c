/* Chapter 24: a world compiled by cji, as a picocalc-os native world.
 *
 * picocalc-os calls a native world through two functions, nw_init and nw_on_event (its
 * sdk/nw.h), and the world calls the kernel through the nw_* functions. This file is both
 * sides for a compiled world: the world's program is SLIR text built into the binary
 * (cji_world_slir, written by tools/nw-build.mjs); nw_init assembles it with slas, runs the
 * world's file (the program's main) and its $nwInit; nw_on_event keeps the event where the
 * runtime's host_event finds it and runs $nwEvent. The program's host_call reaches the kernel
 * through kernel_call, one nw_* function per operation, numbered as sdk/nw_wire.h numbers them.
 *
 * Link it with sdk/nw_proc.c for a host process (the simulated board), or sdk/nw_elf.c for an
 * ELF module on the ESP32-P4: both provide the same nw_* functions and call nw_init and
 * nw_on_event. Only the second needs code for RISC-V (chapter 25 onward). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#ifdef __GLIBC__
#include <malloc.h>
#endif
#include "runtime.h"
#include "nw.h"

extern int64_t exc_flag;
#ifdef CJI_AOT
/* Chapter 26: compiled ahead of time (slas -c): the world's object exports its code's entries
 * and the Error shape; there is no SLIR and no assembler in the binary. */
extern int64_t cji_main(void) __attribute__((weak));   /* (chapter 27: absent when there is a snapshot) */
extern const int64_t cji_snapshot[];                   /* chapter 27: the heap after main, or [0, 0, 0] */
extern int64_t cji_nwInit(int64_t closure);
extern int64_t cji_nwEvent(int64_t closure);
extern int64_t cji_error_shape[];
#ifndef CJI_SHARED   /* (chapter 28: a shared runtime has one, runtime/cji_shared.c) */
int64_t error_shape(void) { return (int64_t)cji_error_shape; }
#endif
#else
extern const unsigned char cji_world_slir[];
extern const size_t cji_world_slir_len;
int slas_load(FILE *f, int verbose, const char *code_out);
void *slas_function(const char *name);
#endif

#ifndef CJI_HEAP_BYTES
#define CJI_HEAP_BYTES (32 * 1024)   /* chapter 25: it grows as the world needs */
#endif

typedef int64_t (*main_fn_t)(void);
typedef int64_t (*entry_fn)(int64_t closure);   /* an entry and its closure (rt_entries) */
static entry_fn on_event;

#include "nw_kernel_call.inc"   /* (kernel_call: shared with the rv32 fake kernel, CJI-4) */
static int kernel_error(char *buf, size_t n) { return nw_error(buf, (int)n); }

/* the kernel's seed for the world's Math.random: FNV-1a of its name, as kernel.c's hash */
static uint64_t fnv(const char *s)
{
	uint64_t h = 1469598103934665603ull;
	while (*s) { h ^= (unsigned char)*s++; h *= 1099511628211ull; }
	return h;
}

#ifdef CJI_SHARED
/* Chapter 28: the runtime and the shared unit are used by other worlds too (on the board, the
 * firmware's, once). This world's runtime state is swapped in when the kernel calls it and out
 * when it returns; a world that crashes goes back to whoever runs the worlds (cji_world_exit
 * does not return), its state swapped out first. */
static struct rt_state state;
extern void cji_world_exit(int status);
#define ENTER() rt_swap(&state)
#define LEAVE() rt_swap(&state)
#define EXIT(n) (LEAVE(), cji_world_exit(n))
#else
#define ENTER() ((void)0)
#define LEAVE() ((void)0)
#define EXIT(n) _exit(n)
#endif

static void fail(const char *why)
{
	nw_log(why);
	EXIT(4);
}

void nw_init(void)
{
	char name[64] = "";
	main_fn_t main_fn;
	entry_fn init;
#ifdef __GLIBC__
	/* (chapter 26) a world lives under a data limit, and glibc keeps what it has: it pads every
	   extension of its heap by 128KB and keeps freed blocks below 128KB. Blocks of 16KB and up (the
	   collector's spaces, a store's text) get their own mapping, given back when freed. */
	mallopt(M_TOP_PAD, 4096);
	mallopt(M_TRIM_THRESHOLD, 16384);
	mallopt(M_MMAP_THRESHOLD, 16384);
#endif
#ifdef CJI_SHARED
	rt_state_init(&state);
#endif
	ENTER();
	rt_kernel_call = kernel_call;
	rt_kernel_error = kernel_error;
	nw_self(name, sizeof name);
	rt_event.seed = (double)(fnv(name) & 0xffffffffu);
#ifdef CJI_AOT
	init = cji_nwInit;
	on_event = cji_nwEvent;
	rt_initialize(CJI_HEAP_BYTES, 1 << 16);
	if (cji_snapshot[0] > 0) {   /* main ran when the world was built: its heap is data */
		rt_load_snapshot(cji_snapshot);
		main_fn = NULL;
	} else
		main_fn = cji_main;
#else
	{
		FILE *f = fmemopen((void *)cji_world_slir, cji_world_slir_len, "r");
		if (!f || slas_load(f, 0, NULL))
			fail("cji: the world's code could not be assembled");
		fclose(f);
	}
	rt_initialize(CJI_HEAP_BYTES, 1 << 16);
	main_fn = (main_fn_t)slas_function("main");
	init = (entry_fn)slas_function("$nwInit");
	on_event = (entry_fn)slas_function("$nwEvent");
#endif
#ifdef CJI_AOT
	if (!cji_snapshot[0] && !main_fn)
		fail("cji: the world's code has neither main nor a snapshot");
#else
	if (!main_fn)
		fail("cji: the world's code has no main");
#endif
	if (!init || !on_event)
		fail("cji: the world's code has no $nwInit or $nwEvent");
	if (main_fn && (main_fn() != 0 || exc_flag))
		fail("cji: the world's file stopped with an exception");
	if (!rt_entries[0] || !rt_entries[1])
		fail("cji: the world's code did not hand over its entries");
	if (init(rt_entries[0]) == 2)
		EXIT(4);
	LEAVE();
}

int nw_on_event(const nw_event *e)
{
	int64_t r;
	ENTER();
	rt_event.kind = e->kind;
	rt_event.type = e->type;
	rt_event.json = e->json;
	rt_event.json_len = e->json_len;
	rt_event.from = e->from;
	rt_event.second = e->kind == NW_SETTLE ? e->ok : e->ask;
	rt_event.timer = e->timer;
	rt_event.token = e->token;
	r = on_event(rt_entries[1]);
	if (r == 2)
		EXIT(4);   /* a handler threw: the world crashes, as a QuickJS world does */
	LEAVE();
	return r == 1 ? NW_LATER : NW_DONE;
}
