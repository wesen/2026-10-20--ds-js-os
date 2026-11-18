/* CJI-4 (chapter 30): the rv32 test firmware's fake kernel, for worlds built as the board's modules.
 *
 *   rv32emu fw-nw.elf NAME.so -- NW_SELF=NAME EVENT...
 *   rv32emu fw-nw.elf A.so B.so ... -- world A EVENT... world B EVENT...
 *
 * The machine (tools/rv32/emu.c) loads each module as elf_loader would and puts its entry in
 * fw_entries. This is the kernel's side of picocalc-os's sdk/nw_elf.h: its table is {abi, call,
 * error}; call is runtime/nw_world.c's mapping of an operation to an nw_* function, and the nw_*
 * functions are tools/nw_fake.c's, which print what they are given. main calls each module's
 * app_main(2, argv) as native_elf_p4.c does, checks the module's table, calls init, then sends the
 * events in chapter 24's syntax (start | tick N | msg TYPE JSON | ask TYPE JSON | settle TOKEN OK JSON
 * | wait MS), printing -> done or -> later after each, as tools/nw_fake.c does. A world that crashed
 * returns something else: alone, the run ends there, as a host world's process does.
 *
 * With several worlds (each list of events after "world NAME", modules in the same order), the
 * kernel is tools/nw_multi.c's: each world has its own clock, tokens and timers, every line its calls
 * print starts with its name, all start first, then the events go round, one of each world at a time,
 * so that every call into a world finds the runtime holding another world's state; a crashed world
 * gets no more events. Arguments of the form NAME=VALUE before the events are the environment
 * (getenv, in libc.c); NW_STEPS=1 there writes each call's instruction count to stderr ("fw: steps").
 *
 * A module's malloc, calloc, realloc and free are the kernel's (the resolve table maps them to fk_*), as
 * native_elf_p4.c maps them to m_malloc and the rest: each block is charged to the world running, and
 * NW_MEM_KB=N refuses one that would take a world past N KB, its loaded bytes and its blocks together, as
 * the board's mem_kb does. NW_MEM=1 writes each world's figures at the end ("fw: memory"). */
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nw.h"
#include "nw_elf.h"

typedef struct {
	const char *name;
	nw_elf_module mod;
	char **ev;               /* its events: from argv, ev[0] the first word of the first */
	int nev, next, dead;
	int64_t t_us;
	int tokens, timers;
	uint32_t loaded, heap, peak, refused;   /* its module's bytes; its live blocks' bytes, the most, refusals */
	int watch;                               /* its root stack, watched by the machine (host calls 11, 12) */
	char *env[18];           /* NW_SELF=NAME, for the printers' nw_self, then the firmware's own */
	char self[80];
} fw_world;
static fw_world worlds[16], *cur;
static int nworlds, prefix;

static int fw_printf(const char *f, ...)
{
	va_list ap;
	int r;
	if (prefix && cur)
		printf("%s: ", cur->name);
	va_start(ap, f);
	r = vfprintf(stdout, f, ap);
	va_end(ap);
	return r;
}
#define NW_PRINTF fw_printf
#include "../../nw_fake_calls.inc"   /* the printers: the host fake kernel's own */
#include "nw_kernel_call.inc"        /* kernel_call: an operation to its nw_* function */

static int kernel_error(char *buf, size_t n) { return nw_error(buf, (int)n); }
static const nw_elf_kernel KERNEL = { NW_ELF_ABI, kernel_call, kernel_error };

/* set by the machine: each module's entry and the bytes it was given (elf_loader's segment_size) */
int (*fw_entries[16])(int, char **);
uint32_t fw_sizes[16];
int fw_nentries;
extern char **fw_environ;
extern uint64_t _hc_steps(void);   /* the machine's instruction count */
extern int _hc_watch(void *begin, void *end);
extern uint32_t _hc_watched(int k);
extern void (*cji_elf_rootstack_hook)(int64_t *begin, int64_t *end);
static void rootstack(int64_t *begin, int64_t *end) { if (cur) cur->watch = _hc_watch(begin, end) + 1; }
static int steps;

/* the kernel's allocator for modules, as native_elf_p4.c's m_malloc family: a 16-byte header, the running
   world charged, and a limit */
typedef struct { uint32_t size, pad[3]; } fk_block;
static uint32_t mem_limit;
void *fk_malloc(size_t n)
{
	fk_block *b;
	if (!cur || (mem_limit && cur->loaded + cur->heap + n > mem_limit)) {
		if (cur)
			cur->refused++;
		return NULL;
	}
	if (!(b = malloc(sizeof *b + n)))
		return NULL;
	b->size = (uint32_t)n;
	cur->heap += (uint32_t)n;
	if (cur->heap > cur->peak)
		cur->peak = cur->heap;
	return b + 1;
}
void fk_free(void *p)
{
	fk_block *b = (fk_block *)p - 1;
	if (!p || !cur)
		return;
	cur->heap -= b->size;
	free(b);
}
void *fk_calloc(size_t k, size_t n)
{
	void *p = n && k > (size_t)-1 / n ? NULL : fk_malloc(k * n);
	if (p)
		memset(p, 0, k * n);
	return p;
}
void *fk_realloc(void *p, size_t n)
{
	fk_block *b = (fk_block *)p - 1;
	void *q;
	if (!p)
		return fk_malloc(n);
	if (!n) {
		fk_free(p);
		return NULL;
	}
	if (!(q = fk_malloc(n)))
		return NULL;
	memcpy(q, p, b->size < n ? b->size : n);
	fk_free(p);
	return q;
}

/* the kernel's state for world w: in while it is called */
static void in(fw_world *w)
{
	cur = w;
	t_us = w->t_us, tokens = w->tokens, timers = w->timers;
	if (prefix)
		fw_environ = w->env;
}
static void out(fw_world *w) { w->t_us = t_us, w->tokens = tokens, w->timers = timers; }
static void count(fw_world *w, const char *what, uint64_t from)
{
	if (steps)
		fprintf(stderr, "fw: steps %s %s %llu\n", w->name, what, (unsigned long long)(_hc_steps() - from));
}

/* the next event of w: 0 or 1 when sent (done, later), -1 for a wait, 2 for a crash */
static int send(fw_world *w)
{
	char **a = w->ev + w->next;
	int kind = 0, second = 0, timer = 0, token = 0, r, used = 1;
	const char *type = "", *json = "null", *from = "harness";
	uint64_t t0;
	if (!strcmp(a[0], "start")) kind = NW_START;
	else if (!strcmp(a[0], "tick")) { kind = NW_TICK; timer = atoi(a[1]); used = 2; }
	else if (!strcmp(a[0], "msg") || !strcmp(a[0], "ask")) { kind = NW_MESSAGE; second = a[0][0] == 'a'; type = a[1]; json = a[2]; used = 3; }
	else if (!strcmp(a[0], "settle")) { kind = NW_SETTLE; token = atoi(a[1]); second = atoi(a[2]); json = a[3]; used = 4; }
	else if (!strcmp(a[0], "wait")) { t_us += 1000LL * atoi(a[1]); w->next += 2; return -1; }
	w->next += used;
	t0 = _hc_steps();
	r = w->mod.event(kind, second, timer, token, type, json, (int)strlen(json), from);
	count(w, a[0], t0);
	if (r != NW_DONE && r != NW_LATER)
		return 2;
	fw_printf("-> %s\n", r == NW_LATER ? "later" : "done");
	return r;
}

int main(int argc, char **argv)
{
	static char *env[16];
	int i = 0, nenv = 0, more = 1, status = 0;
	while (i < argc && strchr(argv[i], '=') && nenv < 15)
		env[nenv++] = argv[i++];
	fw_environ = env;
	steps = getenv("NW_STEPS") != NULL;
	if (getenv("NW_MEM"))
		cji_elf_rootstack_hook = rootstack;
	mem_limit = getenv("NW_MEM_KB") ? (uint32_t)atoi(getenv("NW_MEM_KB")) * 1024 : 0;
	if (i < argc && !strcmp(argv[i], "world")) {   /* several worlds */
		prefix = 1;
		while (i < argc) {
			fw_world *w = &worlds[nworlds++];
			if (nworlds > 16 || i + 1 >= argc || strcmp(argv[i], "world")) { fputs("firmware: world NAME EVENT...\n", stderr); return 2; }
			w->name = argv[i + 1];
			snprintf(w->self, sizeof w->self, "NW_SELF=%s", w->name);
			w->env[0] = w->self;
			for (int e = 0; e < nenv; e++)
				w->env[e + 1] = env[e];
			i += 2;
			w->ev = argv + i;
			while (i < argc && strcmp(argv[i], "world"))
				i++;
			w->nev = (int)(argv + i - w->ev);
		}
	} else {   /* one world, named by NW_SELF */
		fw_world *w = &worlds[nworlds++];
		w->name = getenv("NW_SELF") ? getenv("NW_SELF") : "flaky";
		w->ev = argv + i;
		w->nev = argc - i;
	}
	if (fw_nentries != nworlds) {
		fprintf(stderr, "firmware: %d modules for %d worlds\n", fw_nentries, nworlds);
		return 2;
	}
	for (int k = 0; k < nworlds; k++) {   /* every world starts, in order */
		fw_world *w = &worlds[k];
		char *av[2] = { (char *)(void *)&KERNEL, (char *)(void *)&w->mod };
		uint64_t t0;
		w->loaded = fw_sizes[k];
		if (mem_limit && w->loaded > mem_limit) {   /* as native_elf_p4.c's elf_load */
			fprintf(stderr, "firmware: %s: its code and data take %u KB, more than the %u KB its manifest entry gives it\n",
				w->name, (w->loaded + 1023) / 1024, mem_limit / 1024);
			return 2;
		}
		in(w);
		t0 = _hc_steps();
		fw_entries[k](2, av);
		if (w->mod.abi != NW_ELF_ABI || !w->mod.init || !w->mod.event) {   /* as native_elf_p4.c's elf_load */
			fprintf(stderr, "firmware: %s has no module table (link it with sdk/nw_elf.c)\n", w->name);
			return 2;
		}
		w->mod.init();
		count(w, "init", t0);
		out(w);
	}
	while (more) {   /* then one event of each world at a time */
		more = 0;
		for (int k = 0; k < nworlds; k++) {
			fw_world *w = &worlds[k];
			if (w->dead || w->next >= w->nev)
				continue;
			more = 1;
			in(w);
			if (send(w) == 2) {
				w->dead = 1;
				if (!prefix)
					status = 4;   /* the world crashed: a host world's process exits with 4 */
			}
			out(w);
		}
	}
	fw_environ = env;
	if (getenv("NW_MEM"))
		for (int k = 0; k < nworlds; k++)
			fprintf(stderr, "fw: memory %s loaded %u blocks-peak %u blocks-now %u refused %u rootstack-used %u\n", worlds[k].name,
				worlds[k].loaded, worlds[k].peak, worlds[k].heap, worlds[k].refused, worlds[k].watch ? _hc_watched(worlds[k].watch - 1) : 0);
	return status;
}
