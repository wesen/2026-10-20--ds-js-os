/* CJI-4 (compiling on the board): runtime/aot_main.c for the rv32 test firmware that holds stage 1, the compiler
 * compiled by cji (CJI-3), assembled by slas-rv32 (-S -c stage1.o) and linked into the firmware as the runtime's
 * unit is. The arguments are aot_main.c's:
 *
 *   rv32emu fw-stage1.elf -- [-h heap] [-H cap] [-G ratio] [-C] [-r roots] [-g] -- FILE [--world-unit] [--native]
 *
 * FILE comes from the machine's storage (libc.c's fopen, host call 13); the SLIR goes to standard output. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "runtime.h"

extern int64_t cji_main(void);
extern int64_t cji_error_shape[];
int64_t error_shape(void) { return (int64_t)(intptr_t)cji_error_shape; }
extern uint64_t _hc_steps(void);
#define STAGE1_SLACK 4096
#ifdef CJI_PROFILE_GC
static int64_t guest_steps(void) { return (int64_t)_hc_steps(); }
#endif

int main(int argc, char **argv)
{
	long heap_bytes = 512, root_bytes = 1 << 16;
	int i = 0, gc_stats = 0;
	int64_t status;
	uint64_t t0;
	for (; i < argc; i++)
		if (!strcmp(argv[i], "-h") && i + 1 < argc)
			heap_bytes = atol(argv[++i]);
		else if (!strcmp(argv[i], "-r") && i + 1 < argc)
			root_bytes = atol(argv[++i]);
		else if (!strcmp(argv[i], "-H") && i + 1 < argc)
			rt_heap_cap = atol(argv[++i]);
		else if (!strcmp(argv[i], "-G") && i + 1 < argc)
			rt_heap_ratio = atol(argv[++i]);
		else if (!strcmp(argv[i], "-C"))
			rt_gc_compact = 1;
		else if (!strcmp(argv[i], "-g"))
			gc_stats = 1;
		else {
			if (!strcmp(argv[i], "--"))
				i++;
			break;
		}
	rt_argc = argc - i;
	rt_argv = argv + i;
	t0 = _hc_steps();
	/* (the root stack: every push is checked against its end after the frame is zeroed, so it has STAGE1_SLACK bytes
	   past the end: stage 1 is assembled with --rootstack-slack STAGE1_SLACK, its largest frame being 2,832 bytes) */
	rt_initialize((heap_bytes + 7) / 8 * 8, (root_bytes + 7) / 8 * 8 + STAGE1_SLACK);
	rootstack_end -= STAGE1_SLACK / 8;
#ifdef CJI_PROFILE_GC
	rt_profile_clock = guest_steps;
	uint64_t start = _hc_steps();
#endif
	status = cji_main();
#ifdef CJI_PROFILE_GC
	uint64_t elapsed = _hc_steps() - start;
	if (gc_stats) fprintf(stderr, "cji_metrics frontend_steps=%llu gc_steps=%llu slide_bytes=%llu\n",
		(unsigned long long)elapsed, (unsigned long long)rt_gc_ticks, (unsigned long long)rt_slide_bytes);
#endif
	fflush(stdout);
	if (gc_stats)
		fprintf(stderr, "cji: %lld collections, %lld bytes copied, heap now %lld bytes, most live %lld bytes, spilled %lld bytes;"
			" %llu instructions\n", (long long)rt_collections, (long long)rt_copied_bytes,
			(long long)((fromspace_end - fromspace_begin) * 8), (long long)rt_live_max, (long long)rt_spill_bytes,
			(unsigned long long)(_hc_steps() - t0));
	return (int)status;
}
