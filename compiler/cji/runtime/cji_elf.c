/* CJI-4 (chapter 30): the firmware's side of a compiled world on the board.
 *
 * picocalc-os loads a native world as an ELF module (sdk/nw_elf.h): its entry, app_main(2, argv),
 * fills in the module's table, and the kernel then calls the table's init once and event per event.
 * A module slas-rv32 writes (--module) holds only the world's own code and data and a world block
 * (runtime/cji_elf.h); its three entries are thunks that set cji_elf_world to that block and jump
 * here. The runtime is the firmware's, once for every compiled world, so every call into a world
 * swaps the world's runtime state in, and out when it returns (chapter 28's rt_swap).
 *
 * This is runtime/nw_world.c for a module: the same start (the kernel's hooks, the world's name as
 * the random seed, the heap, the snapshot or main, $nwInit) and the same event, but the kernel's
 * calls need no nw_* layer: the kernel table's call has the runtime's rt_kernel_call signature, the
 * wire's CALL frame, and its error rt_kernel_error's. Compiled once, with the firmware.
 *
 * Two things the board needs that a process did not: what the runtime allocates for a world goes
 * through the module's own malloc, realloc and free (the block names them; on the board they are the
 * kernel's allocator, which charges the world and frees what it holds when the world stops), and a
 * fatal error in the runtime (out of memory, an index out of range, a type error) crashes the world,
 * through rt_fatal and a longjmp back here, instead of stopping the firmware. */
#include <setjmp.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include "runtime.h"
#include "cji_elf.h"
#include "nw_elf.h"

#ifndef CJI_HEAP_BYTES
#define CJI_HEAP_BYTES (32 * 1024)   /* as runtime/nw_world.c: it grows as the world needs */
#endif

typedef int64_t (*entry_fn)(int64_t closure);   /* $nwInit, $nwEvent: an entry and its closure */
struct cji_elf_world {
	uint32_t abi, size;
	const int64_t *snapshot;
	int64_t (*main)(void);
	entry_fn init, event;
	int64_t *error_shape;
	void (*init_thunk)(void);
	int (*event_thunk)(int, int, int, int, const char *, const char *, int, const char *);
	void *(*malloc)(size_t);
	void *(*realloc)(void *, size_t);
	void (*free)(void *);
	const nw_elf_kernel *kernel;
	uint32_t flags;
	uint32_t rootstack;
	uint32_t pad;
	struct rt_state state;
};
#define AT(field, off) _Static_assert(offsetof(struct cji_elf_world, field) == (off), "cji_elf.h: " #field)
AT(abi, CJI_ELF_W_ABI); AT(size, CJI_ELF_W_SIZE); AT(snapshot, CJI_ELF_W_SNAPSHOT); AT(main, CJI_ELF_W_MAIN);
AT(init, CJI_ELF_W_INIT); AT(event, CJI_ELF_W_EVENT); AT(error_shape, CJI_ELF_W_ERROR_SHAPE);
AT(init_thunk, CJI_ELF_W_INIT_THUNK); AT(event_thunk, CJI_ELF_W_EVENT_THUNK); AT(malloc, CJI_ELF_W_MALLOC);
AT(realloc, CJI_ELF_W_REALLOC); AT(free, CJI_ELF_W_FREE); AT(kernel, CJI_ELF_W_KERNEL); AT(flags, CJI_ELF_W_FLAGS);
AT(rootstack, CJI_ELF_W_ROOTSTACK);
AT(state, CJI_ELF_W_STATE);
_Static_assert(sizeof(struct cji_elf_world) <= CJI_ELF_W_BYTES, "cji_elf.h: the block slas-rv32 reserves is too small");

struct cji_elf_world *cji_elf_world;    /* set by a module's thunk just before it jumps here */
/* (for a test firmware: told where each world's root stack is, to measure how much of it is used) */
void (*cji_elf_rootstack_hook)(int64_t *begin, int64_t *end);
static struct cji_elf_world *running;   /* the world whose state the runtime holds */

/* the one function the runtime asks of a program: the Error shape, the running world's (or, with no world
   running, the firmware's own program's: CJI-4 part 2, the compiler that stage 1 is, in a board firmware) */
int64_t *cji_elf_idle_error_shape;
int64_t error_shape(void) { return (int64_t)(intptr_t)(running ? running->error_shape : cji_elf_idle_error_shape); }

/* The root stack's last word: a world whose frames reach it has filled its root stack (compiled code does
   not check), and is crashed when its call returns, before it can run again; what it wrote past the end,
   if anything, is not undone. */
#define CANARY ((int64_t)0x6a09e667f3bcc908LL)
static int overflowed(void) { return rootstack_end && rootstack_end[-1] != CANARY; }

static jmp_buf escape;            /* where a fatal error in the running world comes back to */
static const char *fatal_msg;
static void fatal(const char *msg) { fatal_msg = msg; longjmp(escape, 1); }

#ifndef CJI_ELF_NO_SWAP
static void enter(struct cji_elf_world *w) { rt_swap(&w->state); running = w; rt_fatal = fatal; }
static void leave(struct cji_elf_world *w) { rt_swap(&w->state); running = NULL; rt_fatal = NULL; }
#else   /* (the control of tools/rv32/nw-test.sh MULTI=1: every world in the runtime's one state, which must fail) */
static void enter(struct cji_elf_world *w) { running = w; rt_fatal = fatal; }
static void leave(struct cji_elf_world *w) { (void)w; running = NULL; rt_fatal = NULL; }
#endif

/* the kernel's seed for the world's Math.random: FNV-1a of its name (runtime/nw_world.c) */
static uint64_t fnv(const char *s)
{
	uint64_t h = 1469598103934665603ull;
	while (*s) { h ^= (unsigned char)*s++; h *= 1099511628211ull; }
	return h;
}
/* a world that cannot start or go on: it says why in its log, as nw_world.c's fail, and is crashed */
static void fail(struct cji_elf_world *w, const char *why)
{
	w->kernel->call(1, 0, 0, 0, why, strlen(why), NULL, 0, NULL, 0, NULL, 0);
	w->flags |= CJI_ELF_CRASHED;
}
static void crashed(struct cji_elf_world *w, const char *why)
{
	char text[160];
	size_t n = strlen(why) < sizeof text - 20 ? strlen(why) : sizeof text - 20;
	memcpy(text, "crashed: ", 9);
	memcpy(text + 9, why, n);
	text[9 + n] = '\0';
	fail(w, text);
}

/* app_main(argc, argv): the module's table, from the block */
int cji_elf_entry(int argc, char **argv)
{
	struct cji_elf_world *w = cji_elf_world;
	nw_elf_module *m;
	if (argc < 2 || !w || w->abi != CJI_ELF_ABI || w->size < sizeof *w)
		return -1;   /* (the module was written for another firmware: no table, and the kernel says so) */
	w->kernel = (const nw_elf_kernel *)(void *)argv[0];
	if (!w->kernel || w->kernel->abi != NW_ELF_ABI)
		return -1;
	m = (nw_elf_module *)(void *)argv[1];
	m->init = w->init_thunk;
	m->event = w->event_thunk;
	m->abi = NW_ELF_ABI;
	return 0;
}

static void start(struct cji_elf_world *w)
{
	char name[64] = "";
	if (w->malloc && w->realloc && w->free)   /* (the world's allocator: in its state from here on) */
		rt_malloc = w->malloc, rt_realloc = w->realloc, rt_free = w->free;
	rt_kernel_call = w->kernel->call;
	rt_kernel_error = w->kernel->error;
	w->kernel->call(3, 0, 0, 0, NULL, 0, NULL, 0, NULL, 0, name, sizeof name);   /* self */
	rt_event.seed = (double)(fnv(name) & 0xffffffffu);
	/* The root stack: its size is fixed when the world starts; it cannot grow by moving, because every live
	   frame holds pointers into it. The world's own size (slas-rv32 --rootstack, 4 KB unless asked), or 64 KB.
	   The rv32 code checks every frame it pushes against rootstack_end (task 9), after zeroing the frame's
	   slots, so the end is CJI_ELF_ROOTSTACK_SLACK bytes before the allocation's. */
	rt_initialize(CJI_HEAP_BYTES, (w->rootstack ? (int64_t)w->rootstack : 1 << 16) + CJI_ELF_ROOTSTACK_SLACK);
	rootstack_end -= CJI_ELF_ROOTSTACK_SLACK / 8;   /* (what a frame may write past the end before its push is checked) */
	rootstack_end[-1] = CANARY;   /* (overwritten: the world reached its root stack's end) */
	if (cji_elf_rootstack_hook)
		cji_elf_rootstack_hook(rootstack_begin, rootstack_end);
	if (w->snapshot[0] > 0)   /* main ran when the world was built: its heap is data (chapter 27) */
		rt_load_snapshot(w->snapshot);
	else if (!w->main)
		fail(w, "cji: the world's code has neither main nor a snapshot");
	else if (w->main() != 0 || exc_flag)
		fail(w, "cji: the world's file stopped with an exception");
	if (!(w->flags & CJI_ELF_CRASHED) && (!rt_entries[0] || !rt_entries[1]))
		fail(w, "cji: the world's code did not hand over its entries");
	if (!(w->flags & CJI_ELF_CRASHED) && w->init(rt_entries[0]) == 2)
		w->flags |= CJI_ELF_CRASHED;   /* (its start threw: it logged why) */
}
void cji_elf_init(void)
{
	struct cji_elf_world *w = cji_elf_world;
	rt_state_init(&w->state);
	enter(w);
	if (setjmp(escape))
		crashed(w, fatal_msg);
	else
		start(w);
	if (!(w->flags & CJI_ELF_CRASHED) && overflowed())
		crashed(w, "root stack overflow");
	w->flags |= CJI_ELF_STARTED;
	leave(w);
}

/* One event. 0: done; 1: it answers later; 2: the world has crashed (a handler threw, or it could not
 * start). nw_elf.h has no value for a crash; the kernel takes anything but 0 and 1 as a broken
 * protocol and crashes the world, which is the outcome a crash should have. */
int cji_elf_event(int kind, int second, int timer, int token, const char *type, const char *json, int json_len, const char *from)
{
	struct cji_elf_world *w = cji_elf_world;
	int64_t r;
	if (!(w->flags & CJI_ELF_STARTED) || (w->flags & CJI_ELF_CRASHED))
		return 2;
	enter(w);
	if (setjmp(escape)) {
		crashed(w, fatal_msg);
		leave(w);
		return 2;
	}
	rt_event.kind = kind;
	rt_event.type = type;
	rt_event.json = json;
	rt_event.json_len = json_len;
	rt_event.from = from;
	rt_event.second = second;   /* (ask for a message, ok for a settle: the table gives it as one) */
	rt_event.timer = timer;
	rt_event.token = token;
	r = w->event(rt_entries[1]);
	if (r != 2 && overflowed()) {
		crashed(w, "root stack overflow");
		r = 2;
	}
	leave(w);
	if (r == 2) {
		w->flags |= CJI_ELF_CRASHED;
		return 2;
	}
	return r == 1 ? 1 : 0;
}
