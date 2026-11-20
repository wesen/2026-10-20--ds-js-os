/* Chapter 26: a program compiled ahead of time (slas -c prog.o prog.slir), linked with the
 * runtime alone: no assembler, no SLJIT. The object exports cji_main and the Error shape;
 * this file is what slas's main does around them. Link it -no-pie (or -static): the code
 * holds 64-bit absolute addresses, resolved by the linker. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "runtime.h"

#ifdef CJI_PROFILE_GC
#include <time.h>
static int64_t monotonic_us(void)
{
	struct timespec ts;
	clock_gettime(CLOCK_MONOTONIC, &ts);
	return (int64_t)ts.tv_sec * 1000000 + ts.tv_nsec / 1000;
}
#endif

extern int64_t cji_main(void);
extern int64_t cji_error_shape[];
int64_t error_shape(void) { return (int64_t)cji_error_shape; }

int main(int argc, char **argv)
{
	long heap_bytes = 512, root_bytes = 1 << 16;
	int i = 1, gc_stats = 0;
	int64_t status;
	/* (CJI-3: -h heap-bytes, -H heap cap, -G ratio, -C (mark-compact), -r root-bytes, -g; the rest, after an
   optional --, are the program's) */
	for (; i < argc; i++)
		if (!strcmp(argv[i], "-h") && i + 1 < argc)
			heap_bytes = atol(argv[++i]);
		else if (!strcmp(argv[i], "-r") && i + 1 < argc)
			root_bytes = atol(argv[++i]);
		else if (!strcmp(argv[i], "-H") && i + 1 < argc)
			rt_heap_cap = atol(argv[++i]);
		else if (!strcmp(argv[i], "-G") && i + 1 < argc)
			rt_heap_ratio = atol(argv[++i]);
		else if (!strcmp(argv[i], "-C"))   /* CJI-3 7c: the mark-compact collector */
			rt_gc_compact = 1;
		else if (!strcmp(argv[i], "-Y"))   /* CJI-3: the hybrid collector */
			rt_gc_compact = 2;
		else if (!strcmp(argv[i], "-M") && i + 1 < argc)   /* CJI-3: the memory the heap's spaces may take */
			rt_gc_memory = atol(argv[++i]);
		else if (!strcmp(argv[i], "-g"))
			gc_stats = 1;
		else {
			if (!strcmp(argv[i], "--"))
				i++;
			break;
		}
	rt_argc = argc - i;
	rt_argv = argv + i;
	rt_initialize((heap_bytes + 7) / 8 * 8, (root_bytes + 7) / 8 * 8);
#ifdef CJI_PROFILE_GC
	rt_profile_clock = monotonic_us;
	int64_t start = monotonic_us();
#endif
	status = cji_main();
#ifdef CJI_PROFILE_GC
	int64_t elapsed = monotonic_us() - start;
	if (gc_stats) fprintf(stderr, "cji_metrics frontend_us=%lld gc_us=%lld slide_bytes=%lld\n",
		(long long)elapsed, (long long)rt_gc_ticks, (long long)rt_slide_bytes);
#endif
	fflush(stdout);
	if (gc_stats)
		fprintf(stderr, "cji: %lld collections, %lld bytes copied, heap now %lld bytes, most live %lld bytes, spilled %lld bytes%s\n",
			(long long)rt_collections, (long long)rt_copied_bytes,
			(long long)((fromspace_end - fromspace_begin) * 8), (long long)rt_live_max, (long long)rt_spill_bytes, rt_gc_compact == 1 ? ", mark-compact" : rt_gc_compact == 2 ? ", hybrid" : "");
	if (gc_stats && rt_gc_compact == 2)   /* (CJI-3: how many of the hybrid's collections compacted) */
		fprintf(stderr, "%s: %lld compacting\n", "cji", (long long)rt_hybrid_compactions);
	return (int)status;
}
