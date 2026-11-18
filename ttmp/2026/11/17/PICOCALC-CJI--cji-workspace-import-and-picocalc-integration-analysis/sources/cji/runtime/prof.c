/* CJI-3, lane 6: a sampling profiler for a program compiled ahead of time (stage 1), linked in only
 * when wanted (scripts/lane6/build-stage1-prof.sh). With CJI_PROF=FILE in the environment, the process
 * takes a sample every CJI_PROF_US microseconds of CPU time (default 1000; SIGPROF, ITIMER_PROF): the
 * interrupted pc and the first three words above the stack pointer that point into the program's
 * code (the nearest return addresses: for a sample in a runtime function, usually the compiled code
 * that called it). At exit the samples go to FILE, four 64-bit words each, and the process's mappings
 * to FILE.maps; scripts/lane6/prof.py
 * names them with the binary's symbols (slas -c writes one for every compiled function when
 * SLAS_SYMBOLS is set). Nothing here runs without CJI_PROF. */
#define _GNU_SOURCE
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <ucontext.h>

extern char __executable_start[], etext[];
enum { MAX_SAMPLES = 1 << 21, SCAN = 512, WORDS = 4 };
static uint64_t *samples;
static long nsamples, dropped;
static const char *out;

static void take(int sig, siginfo_t *si, void *ctx)
{
	ucontext_t *u = ctx;
	uint64_t *s, *sp = (uint64_t *)u->uc_mcontext.gregs[REG_RSP];
	int k = 1;
	(void)sig;
	(void)si;
	if (nsamples >= MAX_SAMPLES) {
		dropped++;
		return;
	}
	s = samples + nsamples++ * WORDS;
	s[0] = (uint64_t)u->uc_mcontext.gregs[REG_RIP];
	s[1] = s[2] = s[3] = 0;
	for (int i = 0; i < SCAN && k < WORDS; i++)
		if (sp[i] >= (uint64_t)(uintptr_t)__executable_start && sp[i] < (uint64_t)(uintptr_t)etext)
			s[k++] = sp[i];
}

static void finish(void)
{
	struct itimerval off = { { 0, 0 }, { 0, 0 } };
	FILE *f;
	setitimer(ITIMER_PROF, &off, NULL);
	f = fopen(out, "wb");
	if (!f) {
		perror(out);
		return;
	}
	fwrite(samples, sizeof *samples * WORDS, (size_t)nsamples, f);
	fclose(f);
	{   /* the mappings, FILE.maps, to name addresses in shared libraries */
		char path[4096], buf[4096];
		FILE *m = fopen("/proc/self/maps", "r"), *o;
		size_t got;
		snprintf(path, sizeof path, "%s.maps", out);
		o = fopen(path, "w");
		while (m && o && (got = fread(buf, 1, sizeof buf, m)) > 0)
			fwrite(buf, 1, got, o);
		if (m) fclose(m);
		if (o) fclose(o);
	}
	fprintf(stderr, "prof: %ld samples to %s (%ld dropped)\n", nsamples, out, dropped);
}

__attribute__((constructor)) static void start(void)
{
	struct sigaction sa;
	struct itimerval every;
	long us = getenv("CJI_PROF_US") ? atol(getenv("CJI_PROF_US")) : 1000;
	out = getenv("CJI_PROF");
	if (!out)
		return;
	samples = calloc((size_t)MAX_SAMPLES * WORDS, sizeof *samples);
	if (!samples) {
		perror("prof");
		return;
	}
	memset(&sa, 0, sizeof sa);
	sa.sa_sigaction = take;
	sa.sa_flags = SA_SIGINFO | SA_RESTART;
	sigemptyset(&sa.sa_mask);
	sigaction(SIGPROF, &sa, NULL);
	every.it_interval.tv_sec = us / 1000000;
	every.it_interval.tv_usec = us % 1000000;
	every.it_value = every.it_interval;
	setitimer(ITIMER_PROF, &every, NULL);
	atexit(finish);
}
