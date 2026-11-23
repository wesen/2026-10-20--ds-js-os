/* rv32emu: RV32_TRACE and RV32_PROFILE, the names of functions and the per-function report. */
#include "machine.h"

/* RV32_TRACE=1: every call (jal/jalr that links ra) is printed with its target's name and a0..a5 */
static sym *funcs;
static int nfuncs, funcs_cap;
int tracing;
void add_func(const char *name, uint32_t at)
{
	if (nfuncs == funcs_cap && !(funcs = realloc(funcs, sizeof *funcs * (size_t)(funcs_cap = 2 * funcs_cap + 256)))) die("out of memory");
	funcs[nfuncs++] = (sym){ strdup(name), at };
}
/* RV32_PROFILE=1: instructions counted by function (the nearest symbol at or below the pc) */
uint32_t *prof;
static int by_value(const void *a, const void *b) { uint32_t x = ((const sym *)a)->value, y = ((const sym *)b)->value; return x < y ? -1 : x > y; }
void profile_report(void)
{
	uint64_t *per;
	if (!prof || !nfuncs) return;
	qsort(funcs, (size_t)nfuncs, sizeof *funcs, by_value);
	per = calloc((size_t)nfuncs, sizeof *per);
	for (uint32_t a = 0, f = 0; a < MEM_SIZE / 2; a++) {
		if (!prof[a]) continue;
		while (f + 1 < (uint32_t)nfuncs && funcs[f + 1].value <= 2 * a) f++;
		per[f] += prof[a];
	}
	int top = atoi(getenv("RV32_PROFILE")) > 1 ? nfuncs : 40;   /* (RV32_PROFILE=2: every function that ran) */
	for (int k = 0; k < top; k++) {   /* (and the times each was entered: the count at its first instruction) */
		int best = 0;
		for (int i = 1; i < nfuncs; i++) if (per[i] > per[best]) best = i;
		if (!per[best]) break;
		fprintf(stderr, "%12llu %s (entered %u times)\n", (unsigned long long)per[best], funcs[best].name, funcs[best].value / 2 < MEM_SIZE / 2 ? prof[funcs[best].value / 2] : 0);
		per[best] = 0;
	}
	for (int n = 0; n < 128; n++)   /* (CJI-4: the host calls, named by the symbol of the stub that made them) */
		if (hc_calls[n]) {
			int f = 0;
			while (f + 1 < nfuncs && funcs[f + 1].value <= hc_pc[n]) f++;
			fprintf(stderr, "%12llu host calls %d (%s)\n", (unsigned long long)hc_calls[n], n, funcs[f].name);
		}
}
const char *func_at(uint32_t at)
{
	for (int i = 0; i < nfuncs; i++)
		if (funcs[i].value == at) return funcs[i].name;
	return "?";
}
