/* CJI-4, part 2 (CJI-3 phase C, step 10): a world compiled on the board and run there. The test firmware
 * build/rv32/fw-board.elf holds what the board's firmware would: the runtime, the glue (runtime/cji_elf.c), the world
 * runtime's unit and its list, stage 1 (the compiler compiled by cji, assembled by slas-rv32), slas itself built for
 * rv32, and a loader for a module in memory (tools/rv32/fw/elf_load.c, as elf_loader's esp_elf_relocate). The kernel
 * is the fake one of nw_main.c, included below.
 *
 *   rv32emu fw-board.elf -- [-h heap] [-H cap] [-o PREFIX] SOURCE [--stats] [--spill] -- [NAME=VALUE...] EVENT...
 *
 * 1. stage 1 compiles SOURCE (a file of the machine's storage) alone against the runtime's unit (--world-unit), in a
 *    runtime state of its own; its SLIR goes to memory (standard output as a memory stream), and its heap is freed
 *    when it is done. A compile that runs out of heap (-H) is refused, and the firmware goes on;
 * 2. the world's main gets the call to the unit's start that tools/link-units.mjs inserts ($main$prelude), and slas,
 *    built for the board, assembles the world's text as the board's module (-c world.so --module --extern unit.list,
 *    no snapshot) into memory (libc.c's files);
 * 3. the firmware loads the module from memory, and the fake kernel runs it with the events, as fw-nw-units.elf does.
 *
 * With -o PREFIX the SLIR and the module are also saved to the machine's storage (PREFIX.slir, PREFIX.so), for the
 * test to compare with the host's. Each phase's instructions and the most the firmware's malloc held during it go to
 * stderr ("fw: phase NAME steps N malloc-peak N malloc-now N"). --stats and --spill are the compiler's: each pass's time
 * (which the emulator's RV32_CLOCK makes its instruction count) and the live heap after it; and its texts between
 * passes kept in its store (runtime.c's rt_spill_put: a tmpfile, here in memory) instead of its heap. */
#include <setjmp.h>
#define main fw_kernel_main
#include "nw_main.c"
#undef main
#include "runtime.h"

extern int64_t cji_main(void);   /* stage 1's */
extern int64_t cji_stage1_error_shape[];   /* (stage 1's cji_error_shape, renamed: the unit has one too) */
extern int64_t *cji_elf_idle_error_shape;
int board_slas(int argc, char **argv, size_t *most, size_t *left);   /* slas_main in a region (board_slas.c) */
extern const char cji_unit_list[];
extern const unsigned cji_unit_list_len;
int fw_elf_load(const uint8_t *d, size_t n, uint8_t **block, uint32_t *size, uint32_t *entry, char *why, size_t why_n);
extern int _hc_save(const char *path, const void *p, size_t n);
extern uint64_t _hc_mem(void);   /* the bytes in malloc's blocks now, and the most since the last call */
#define STAGE1_SLACK 4096        /* (as tools/rv32/fw/stage1_main.c: stage 1 is assembled with --rootstack-slack 4096) */

static uint64_t t0;
static void phase(const char *what)
{
	uint64_t now = _hc_steps(), m = _hc_mem();
	fprintf(stderr, "fw: phase %s steps %llu malloc-peak %lu malloc-now %lu\n", what, (unsigned long long)(now - t0),
		(unsigned long)(m >> 32), (unsigned long)(uint32_t)m);
	t0 = _hc_steps();
}
static void save(const char *prefix, const char *what, const void *p, size_t n)
{
	char path[256];
	snprintf(path, sizeof path, "%s.%s", prefix, what);
	if (_hc_save(path, p, n))
		fprintf(stderr, "board: %s could not be saved\n", path);
}

static jmp_buf refused;   /* (a fatal error in the compile: out of heap) */
static const char *refusal;
static void compile_fatal(const char *msg) { refusal = msg; longjmp(refused, 1); }

/* 1. the compile, in a runtime state of its own; its SLIR (malloc'd), or NULL */
static char *compile(char **cargv, int cargc, long heap, size_t *n)
{
	static struct rt_state state;
	char *slir = NULL;
	FILE *was = stdout;
	int64_t status;
	*n = 0;
	rt_state_init(&state);
	rt_swap(&state);   /* (the firmware's idle state waits in state) */
	rt_argc = cargc;
	rt_argv = cargv;
	cji_elf_idle_error_shape = cji_stage1_error_shape;
	stdout = open_memstream(&slir, n);
	rt_fatal = compile_fatal;
	if (!setjmp(refused)) {
		rt_initialize((heap + 7) / 8 * 8, (1 << 16) + STAGE1_SLACK);
		rootstack_end -= STAGE1_SLACK / 8;
		status = cji_main();
		if (status || exc_flag) {
			refusal = "the compiler stopped";
			fflush(stdout);
			fprintf(stderr, "board: %.*s\n", (int)(*n < 300 ? *n : 300), slir ? slir : "");
		}
	}
	rt_fatal = NULL;
	fclose(stdout);
	stdout = was;
	fprintf(stderr, "fw: compile %lld collections, heap %lld bytes, most live %lld bytes, spilled %lld bytes, %lu bytes of SLIR\n",
		(long long)rt_collections, (long long)((fromspace_end - fromspace_begin) * 8), (long long)rt_live_max,
		(long long)rt_spill_bytes, (unsigned long)*n);
	rt_free(fromspace_begin);   /* (the compile's heap, root stack and spills: nothing of them is kept) */
	rt_free(rootstack_begin);
	rt_spill_reset();
	rt_swap(&state);
	cji_elf_idle_error_shape = NULL;
	if (refusal) {
		fprintf(stderr, "board: the compile was refused: %s\n", refusal);
		free(slir);
		return NULL;
	}
	return slir;
}

/* 2. the call to the runtime unit's start, as tools/link-units.mjs inserts it (the unit's own text is not needed:
   slas finds what it names in the unit's list) */
static char *with_start(const char *slir, size_t slir_n, size_t *n)
{
	static const char call[] = "    call    $main$prelude/0\n";
	const char *m = !strncmp(slir, "function main/0", 15) ? slir : strstr(slir, "\nfunction main/0"), *s;
	char *text;
	if (!m || !(s = strstr(m, "\nstart:\n")) || strchr(m + 1, '\n') != s)
		return NULL;
	s += 8;
	*n = slir_n + sizeof call - 1;
	if (!(text = malloc(*n + 1)))
		return NULL;
	memcpy(text, slir, (size_t)(s - slir));
	memcpy(text + (s - slir), call, sizeof call - 1);
	memcpy(text + (s - slir) + sizeof call - 1, s, slir_n - (size_t)(s - slir));
	text[*n] = 0;
	return text;
}

int main(int argc, char **argv)
{
	long heap = 4 << 20;
	const char *prefix = NULL, *source = NULL, *module;
	char *slir, *text, why[160];
	size_t slir_n, text_n, module_n;
	int i = 0, cargc = 2;
	char *cargv[8] = { NULL, "--world-unit" };   /* (the compiler's arguments: SOURCE --world-unit, then its flags) */
	uint8_t *block;
	uint32_t size, entry;
	for (; i < argc && strcmp(argv[i], "--"); i++)
		if (!strcmp(argv[i], "-h") && i + 1 < argc)
			heap = atol(argv[++i]);
		else if (!strcmp(argv[i], "-H") && i + 1 < argc)
			rt_heap_cap = atol(argv[++i]);
		else if (!strcmp(argv[i], "-o") && i + 1 < argc)
			prefix = argv[++i];
		else if ((!strcmp(argv[i], "--stats") || !strcmp(argv[i], "--spill")) && cargc < 7)
			cargv[cargc++] = argv[i];
		else
			cargv[0] = argv[i], source = argv[i];
	if (i < argc)
		i++;
	if (!source) {
		fputs("board: fw-board.elf -- [-h heap] [-H cap] [-o PREFIX] SOURCE [--stats] [--spill] -- EVENT...\n", stderr);
		return 2;
	}
	_hc_mem();
	t0 = _hc_steps();
	slir = compile(cargv, cargc, heap, &slir_n);
	phase(slir ? "compile" : "compile-refused");   /* (refused: what it held is freed, and the firmware goes on) */
	if (!slir)
		return 3;
	if (prefix)
		save(prefix, "slir", slir, slir_n);
	if (!(text = with_start(slir, slir_n, &text_n))) {
		fputs("board: the world's text has no main\n", stderr);
		return 3;
	}
	free(slir);
	fw_file_put("world.slir", text, text_n);   /* (the file system slas sees: libc.c's named buffers) */
	free(text);
	fw_file_put("unit.list", cji_unit_list, cji_unit_list_len);
	{
		char *sargv[] = { "slas", "-c", "world.so", "--module", "--extern", "unit.list", "world.slir", NULL };
		size_t most, left;
		int status = board_slas(7, sargv, &most, &left);
		fw_file_drop("world.slir");
		fw_file_drop("unit.list");
		fprintf(stderr, "fw: slas status %d, its blocks held at most %lu bytes, %lu left when it returned (freed)\n", status,
			(unsigned long)most, (unsigned long)left);
		if (status || !(module = fw_file_get("world.so", &module_n))) {
			fputs("board: slas made no module\n", stderr);
			return 3;
		}
	}
	phase("slas");
	if (prefix)
		save(prefix, "so", module, module_n);
	if (fw_elf_load((const uint8_t *)module, module_n, &block, &size, &entry, why, sizeof why)) {
		fprintf(stderr, "board: %s\n", why);
		return 3;
	}
	fw_file_drop("world.so");   /* (the loader copied it into the world's block) */
	phase("load");
	fw_entries[0] = (int (*)(int, char **))(uintptr_t)entry;
	fw_sizes[0] = size;
	fw_nentries = 1;
	{
		int status = fw_kernel_main(argc - i, argv + i);
		phase("run");
		return status;
	}
}
