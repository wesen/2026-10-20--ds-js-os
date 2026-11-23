/* rv32emu-vectors: rv32emu's processor (execute.c, fpu.c, decode.c, machine.c) on single instructions, for the
 * conformance suite (bench/reference/rv32, run by tests/rv32/rv32emu.test.mjs, which compares the results).
 *
 * Each input line is one vector's state, in hexadecimal: the word, fcsr, x0..x31, f0..f31 and the 32-byte memory
 * window at 0x1100 (or "-"). The word goes to pc 0x2000; one instruction executes. Each output line is
 *   ok NEXT FCSR x0..x31 f0..f31 WINDOW      or      fault MESSAGE
 * A die() during the instruction (an illegal encoding, an ebreak, a host call) is a fault. Host calls are not
 * answered here. */
#include "machine.h"
#include <setjmp.h>

#define PC 0x2000u
#define WINDOW 0x1100u

void hostcall(uint32_t n) { die("host call %u at %#x", n, pc); }
uint64_t hc_calls[128];
uint32_t hc_pc[128];
int tracing;
uint32_t *prof;
const char *func_at(uint32_t at) { (void)at; return "?"; }
void profile_report(void) {}

int main(void)
{
	static char line[4096];
	static jmp_buf jump;
	if (!(mem = calloc(1, MEM_SIZE))) die("no memory for the guest");
	while (fgets(line, sizeof line, stdin)) {
		char *p = line, window[80];
		uint32_t word;
		int n;
		memset(mem + 0x1000, 0, 0x4000);
		if (sscanf(p, "%x %x%n", &word, &fcsr, &n) != 2) die("bad input line");
		p += n;
		for (int r = 0; r < 64; r++) {
			if (sscanf(p, "%x%n", r < 32 ? &x[r] : &f[r - 32], &n) != 1) die("bad register");
			p += n;
		}
		if (sscanf(p, "%79s", window) != 1) die("bad window");
		if (window[0] != '-')
			for (int k = 0; k < 32; k++) sscanf(window + 2 * k, "%2hhx", &mem[WINDOW + k]);
		x[0] = 0;
		memcpy(mem + PC, &word, 4);
		pc = PC;
		die_jump = &jump;
		if (setjmp(jump)) {
			printf("fault %s\n", die_message);
			continue;
		}
		step();
		die_jump = NULL;
		printf("ok %x %x", pc, fcsr);
		for (int r = 0; r < 32; r++) printf(" %x", x[r]);
		for (int r = 0; r < 32; r++) printf(" %x", f[r]);
		putchar(' ');
		for (int k = 0; k < 32; k++) printf("%02x", mem[WINDOW + k]);
		putchar('\n');
	}
	return 0;
}
