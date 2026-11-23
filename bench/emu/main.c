/* Chapter 29: an RV32IM machine for testing on a host with no RISC-V hardware.
 *
 *   rv32emu FIRMWARE.elf [MODULE.o | MODULE.so ...] [-- args for the firmware]
 *
 * FIRMWARE.elf is an executable linked for rv32 (tools/rv32/fw: the C runtime as picocalc-os's build
 * would compile it, with a C library whose calls end in `ecall`). MODULE.o is what slas writes for
 * rv32: an ELF32 relocatable object, which this program loads and links against the firmware's symbols
 * as the board's elf_loader would load a module against the firmware's resolve table.
 * (CJI-4, chapter 30: MODULE.so is the module the board itself loads, an ELF shared object; the
 * loader for it, load_shared below, does what elf_loader does and nothing more, and resolves names
 * only through the firmware's own table, fw_resolve, as native_elf_p4.c's resolve() would.)
 *
 * The firmware's library calls are answered here (hostcall below): output, time, the heap, the maths
 * functions and the soft-float and 64-bit helpers. Answering them with the host's own C library keeps
 * the results bit for bit those of the host build, which is what the tests compare with. */
#include "machine.h"

int main(int argc, char **argv)
{
	uint32_t entry, end, hook;
	const char *module = NULL;
	int k = 1, fargc, nshared = 0;
	if (argc < 2) {
		fprintf(stderr, "usage: rv32emu FIRMWARE.elf [MODULE.o | MODULE.so ...] [-- args]\n");
		return 2;
	}
	tracing = getenv("RV32_TRACE") != NULL;
	if (getenv("RV32_PROFILE") && !(prof = calloc(MEM_SIZE / 2, sizeof *prof))) die("no memory for the profile");
	if (!(mem = calloc(1, MEM_SIZE))) die("no memory for the guest");
	entry = load_firmware(argv[k++], &end);
	while (k < argc && strcmp(argv[k], "--")) {
		const char *m = argv[k++];
		size_t len = strlen(m);
		if (len > 3 && !strcmp(m + len - 3, ".so")) {   /* CJI-4: the board's module: its entry for the firmware */
			uint32_t e, size, entries = fw_sym("fw_entries"), sizes = fw_sym("fw_sizes"), count = fw_sym("fw_nentries");
			if (!entries || !sizes || !count) die("the firmware takes no modules (fw_entries, fw_sizes, fw_nentries)");
			if (nshared == 16) die("at most 16 modules");
			end = load_shared(m, (end + 4095) & ~4095u, &e, &size);
			st32(entries + 4 * (uint32_t)nshared, e);
			st32(sizes + 4 * (uint32_t)nshared, size);
			st32(count, (uint32_t)++nshared);
			if (getenv("RV32_SIZES")) fprintf(stderr, "rv32emu: %s: %u bytes loaded\n", m, size);
		} else
			module = m;
	}
	if (k < argc && !strcmp(argv[k], "--")) k++;
	if (module) {
		end = load_module(module, (end + 4095) & ~4095u);
		/* what the module gives the firmware: firmware variables named fw_NAME get module symbol NAME */
		for (int i = 0; i < nfw_syms; i++)
			if (!strncmp(fw_syms[i].name, "fw_", 3) && (hook = module_sym(fw_syms[i].name + 3)))
				st32(fw_syms[i].value, hook);
	}
	if (end > HEAP_BASE) die("the firmware and module reach %#x, past the heap's start", end);
	/* argc and argv for the firmware's main, on the stack */
	fargc = argc - k;
	{
		uint32_t sp = STACK_TOP - 4096, argvp = sp, strs = sp + 4 * (uint32_t)(fargc + 1);
		for (int i = 0; i < fargc; i++) {
			size_t n = strlen(argv[k + i]) + 1;
			st32(argvp + 4 * (uint32_t)i, strs);
			memcpy(mem + strs, argv[k + i], n);
			strs += (uint32_t)n;
		}
		st32(argvp + 4 * (uint32_t)fargc, 0);
		x[2] = (sp - 64) & ~15u;   /* sp */
		x[10] = (uint32_t)fargc;
		x[11] = argvp;
	}
	pc = entry;
	run();
	return 0;
}
