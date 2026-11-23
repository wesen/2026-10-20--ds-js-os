/* rv32emu: guest memory, its loads and stores, the watched ranges, die. */
#include "machine.h"

uint8_t *mem;
uint32_t x[32], pc;
uint64_t steps;

void die(const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	fputs("rv32emu: ", stderr);
	vfprintf(stderr, fmt, ap);
	fputc('\n', stderr);
	va_end(ap);
	exit(70);
}
void check(uint32_t a, uint32_t n)
{
	if ((uint64_t)a + n > MEM_SIZE || a < 4096)
		die("access to %#x (pc %#x)", a, pc);
}
uint32_t ld32(uint32_t a) { uint32_t v; check(a, 4); memcpy(&v, mem + a, 4); return v; }
uint16_t ld16(uint32_t a) { uint16_t v; check(a, 2); memcpy(&v, mem + a, 2); return v; }
uint8_t ld8(uint32_t a) { check(a, 1); return mem[a]; }
/* CJI-4: ranges the firmware asks to have watched (host call 11): the highest byte stored in each, so that a
   world's root stack use can be measured without touching the world */
struct watch watch[16];
int nwatch;
static void watched(uint32_t a, uint32_t n)
{
	for (int i = 0; i < nwatch; i++)
		if (a >= watch[i].b && a < watch[i].e && a + n - watch[i].b > watch[i].peak)
			watch[i].peak = a + n - watch[i].b;
}
void st32(uint32_t a, uint32_t v) { check(a, 4); memcpy(mem + a, &v, 4); if (nwatch) watched(a, 4); }
void st16(uint32_t a, uint16_t v) { check(a, 2); memcpy(mem + a, &v, 2); if (nwatch) watched(a, 2); }
void st8(uint32_t a, uint8_t v) { check(a, 1); mem[a] = v; if (nwatch) watched(a, 1); }
uint64_t ld64(uint32_t a) { return ld32(a) | (uint64_t)ld32(a + 4) << 32; }
void st64(uint32_t a, uint64_t v) { st32(a, (uint32_t)v); st32(a + 4, (uint32_t)(v >> 32)); }
char *str(uint32_t a) { check(a, 1); return (char *)mem + a; }
