/* rv32emu: the registers, guest memory, the watched ranges, die (the accesses are inline in machine.h). */
#include "machine.h"

uint8_t *mem;
uint32_t x[32], pc;
uint64_t steps;
jmp_buf *die_jump;
char die_message[512];

void die(const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	if (die_jump) {
		vsnprintf(die_message, sizeof die_message, fmt, ap);
		va_end(ap);
		longjmp(*die_jump, 1);
	}
	fputs("rv32emu: ", stderr);
	vfprintf(stderr, fmt, ap);
	fputc('\n', stderr);
	va_end(ap);
	exit(70);
}
/* CJI-4: ranges the firmware asks to have watched (host call 11): the highest byte stored in each, so that a
   world's root stack use can be measured without touching the world */
struct watch watch[16];
int nwatch;
void watched(uint32_t a, uint32_t n)
{
	for (int i = 0; i < nwatch; i++)
		if (a >= watch[i].b && a < watch[i].e && a + n - watch[i].b > watch[i].peak)
			watch[i].peak = a + n - watch[i].b;
}
