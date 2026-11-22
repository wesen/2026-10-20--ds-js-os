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
#define _GNU_SOURCE
#include <elf.h>
#include <math.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MEM_SIZE (96u << 20)     /* guest memory: 96 MB at address 0 */
#define STACK_TOP (MEM_SIZE - 16)
#define HEAP_BASE (32u << 20)    /* the firmware's malloc arena: 32 MB .. 88 MB (CJI-4: 56 MB; malloc here neither */
#define HEAP_END (88u << 20)     /* splits nor joins blocks, and a compile on the board came within 1 MB of 24) */

static uint8_t *mem;
static uint32_t x[32], pc;
static uint64_t steps;

static void profile_report(void);
static void die(const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	fputs("rv32emu: ", stderr);
	vfprintf(stderr, fmt, ap);
	fputc('\n', stderr);
	va_end(ap);
	exit(70);
}
static void check(uint32_t a, uint32_t n)
{
	if ((uint64_t)a + n > MEM_SIZE || a < 4096)
		die("access to %#x (pc %#x)", a, pc);
}
static uint32_t ld32(uint32_t a) { uint32_t v; check(a, 4); memcpy(&v, mem + a, 4); return v; }
static uint16_t ld16(uint32_t a) { uint16_t v; check(a, 2); memcpy(&v, mem + a, 2); return v; }
static uint8_t ld8(uint32_t a) { check(a, 1); return mem[a]; }
/* CJI-4: ranges the firmware asks to have watched (host call 11): the highest byte stored in each, so that a
   world's root stack use can be measured without touching the world */
static struct { uint32_t b, e, peak; } watch[16];
static int nwatch;
static void watched(uint32_t a, uint32_t n)
{
	for (int i = 0; i < nwatch; i++)
		if (a >= watch[i].b && a < watch[i].e && a + n - watch[i].b > watch[i].peak)
			watch[i].peak = a + n - watch[i].b;
}
static void st32(uint32_t a, uint32_t v) { check(a, 4); memcpy(mem + a, &v, 4); if (nwatch) watched(a, 4); }
static void st16(uint32_t a, uint16_t v) { check(a, 2); memcpy(mem + a, &v, 2); if (nwatch) watched(a, 2); }
static void st8(uint32_t a, uint8_t v) { check(a, 1); mem[a] = v; if (nwatch) watched(a, 1); }
static uint64_t ld64(uint32_t a) { return ld32(a) | (uint64_t)ld32(a + 4) << 32; }
static void st64(uint32_t a, uint64_t v) { st32(a, (uint32_t)v); st32(a + 4, (uint32_t)(v >> 32)); }
static char *str(uint32_t a) { check(a, 1); return (char *)mem + a; }

/* ---- the heap the firmware's malloc hands out: first fit over a list of blocks ---- */
typedef struct blk { uint32_t at, size; int used; uint32_t req; } blk;   /* (req: the bytes asked for, rounded to 16) */
static blk *blks;
static int nblks, blks_cap;
static uint32_t heap_top = HEAP_BASE;
static uint32_t live, live_peak, live_max;   /* (CJI-4: the bytes asked for of the blocks in use, each rounded to 16, as a
                                                 firmware's allocator would hold them; the most since host call 15 asked; ever) */
static uint32_t h_used(uint32_t n)
{
	live += n;
	if (live > live_peak) live_peak = live;
	if (live > live_max) live_max = live;
	return n;
}
static uint32_t h_malloc(uint32_t n)
{
	n = (n + 15) & ~15u;
	if (!n) n = 16;
	for (int i = 0; i < nblks; i++)
		if (!blks[i].used && blks[i].size >= n) { blks[i].used = 1; blks[i].req = h_used(n); return blks[i].at; }
	if (heap_top + n > HEAP_END) return 0;
	if (nblks == blks_cap && !(blks = realloc(blks, sizeof *blks * (size_t)(blks_cap = 2 * blks_cap + 64)))) die("out of memory");
	blks[nblks++] = (blk){ heap_top, n, 1, h_used(n) };
	heap_top += n;
	return heap_top - n;
}
static blk *h_find(uint32_t a) { for (int i = 0; i < nblks; i++) if (blks[i].at == a && blks[i].used) return &blks[i]; return NULL; }
static void h_free(uint32_t a) { blk *b = a ? h_find(a) : NULL; if (a && !b) die("free of %#x, which malloc did not give", a); if (b) b->used = 0, live -= b->req; }
static uint32_t h_realloc(uint32_t a, uint32_t n)
{
	blk *b = a ? h_find(a) : NULL;
	uint32_t c;
	if (a && !b) die("realloc of %#x, which malloc did not give", a);
	if (b && b->size >= n) { live -= b->req; b->req = h_used(n ? (n + 15) & ~15u : 16); return a; }
	if (!(c = h_malloc(n))) return 0;
	if (b) { memcpy(mem + c, mem + a, b->size); b = h_find(a); b->used = 0; live -= b->req; }
	return c;
}

/* ---- printf: the format is read from guest memory, the arguments from the va_list (a pointer) ---- */
static uint32_t va_word(uint32_t *ap) { uint32_t v = ld32(*ap); *ap += 4; return v; }
static uint64_t va_dword(uint32_t *ap) { uint64_t v; *ap = (*ap + 7) & ~7u; v = ld64(*ap); *ap += 8; return v; }
static int format(char *out, size_t n, const char *f, uint32_t ap)
{
	size_t len = 0;
	char spec[64];
	static char piece[1 << 20];   /* (a %s may be long: a whole page of output) */
	while (*f) {
		if (*f != '%' || f[1] == '%') {
			if (len + 1 < n) out[len] = *f;
			len++;
			f += *f == '%' ? 2 : 1;
			continue;
		}
		/* %[flags][width][.prec][length]conv */
		const char *s = f++;
		int star_w = 0, star_p = 0, ll = 0, l = 0, z = 0;
		while (strchr("-+ #0", *f)) f++;
		if (*f == '*') { star_w = 1; f++; } else while (*f >= '0' && *f <= '9') f++;
		if (*f == '.') { f++; if (*f == '*') { star_p = 1; f++; } else while (*f >= '0' && *f <= '9') f++; }
		if (*f == 'h') { f++; if (*f == 'h') f++; }
		else if (*f == 'l') { f++; if (*f == 'l') { ll = 1; f++; } else l = 1; }
		else if (*f == 'z' || *f == 'j' || *f == 't') { z = *f == 'j' ? 2 : 1; f++; }
		char conv = *f++;
		/* the spec without its length modifier: the value is passed at the host's width */
		size_t k = 0;
		for (const char *p = s; p < f - 1 && k + 4 < sizeof spec; p++)
			if (!strchr("hlzjt", *p)) spec[k++] = *p;
		int w = star_w ? (int)va_word(&ap) : 0, p = star_p ? (int)va_word(&ap) : 0;
		int m;
		switch (conv) {
		case 'd': case 'i':
			spec[k++] = 'l'; spec[k++] = 'l'; spec[k++] = conv; spec[k] = 0;
			{ long long v = ll || z == 2 ? (long long)va_dword(&ap) : (long long)(int32_t)va_word(&ap); (void)l;
			  m = star_w && star_p ? snprintf(piece, sizeof piece, spec, w, p, v) : star_w || star_p ? snprintf(piece, sizeof piece, spec, star_w ? w : p, v) : snprintf(piece, sizeof piece, spec, v); }
			break;
		case 'u': case 'x': case 'X': case 'o':
			spec[k++] = 'l'; spec[k++] = 'l'; spec[k++] = conv; spec[k] = 0;
			{ unsigned long long v = ll || z == 2 ? va_dword(&ap) : va_word(&ap);
			  m = star_w && star_p ? snprintf(piece, sizeof piece, spec, w, p, v) : star_w || star_p ? snprintf(piece, sizeof piece, spec, star_w ? w : p, v) : snprintf(piece, sizeof piece, spec, v); }
			break;
		case 'c':
			spec[k++] = 'c'; spec[k] = 0;
			m = snprintf(piece, sizeof piece, spec, (int)va_word(&ap));
			break;
		case 's':
			spec[k++] = 's'; spec[k] = 0;
			{ uint32_t a = va_word(&ap); const char *v = a ? str(a) : "(null)";
			  m = star_w && star_p ? snprintf(piece, sizeof piece, spec, w, p, v) : star_w || star_p ? snprintf(piece, sizeof piece, spec, star_w ? w : p, v) : snprintf(piece, sizeof piece, spec, v); }
			break;
		case 'p':
			m = snprintf(piece, sizeof piece, "0x%x", va_word(&ap));
			break;
		case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': case 'a': case 'A':
			spec[k++] = conv; spec[k] = 0;
			{ uint64_t bits = va_dword(&ap); double v; memcpy(&v, &bits, 8);
			  m = star_w && star_p ? snprintf(piece, sizeof piece, spec, w, p, v) : star_w || star_p ? snprintf(piece, sizeof piece, spec, star_w ? w : p, v) : snprintf(piece, sizeof piece, spec, v); }
			break;
		default:
			die("printf: %%%c is not handled", conv);
		}
		if (m < 0) m = 0;
		if ((size_t)m >= sizeof piece) die("printf: a piece longer than %zu bytes", sizeof piece);
		for (int i = 0; i < m; i++) { if (len + 1 < n) out[len] = piece[i]; len++; }
	}
	if (n) out[len < n ? len : n - 1] = 0;
	return (int)len;
}

/* ---- the calls the firmware's library makes (compiler/cji/tools/rv32/fw/hostcalls.S numbers them) ---- */
static double dreg(int i) { uint64_t b = x[i] | (uint64_t)x[i + 1] << 32; double d; memcpy(&d, &b, 8); return d; }
static void dret(double d) { uint64_t b; memcpy(&b, &d, 8); x[10] = (uint32_t)b; x[11] = (uint32_t)(b >> 32); }
static float freg(int i) { float f; memcpy(&f, &x[i], 4); return f; }
static void fret(float f) { memcpy(&x[10], &f, 4); }
static int64_t i64reg(int i) { return (int64_t)(x[i] | (uint64_t)x[i + 1] << 32); }
static void i64ret(int64_t v) { x[10] = (uint32_t)v; x[11] = (uint32_t)((uint64_t)v >> 32); }
static int cmp_lt(double a, double b) { return a < b ? -1 : a == b ? 0 : 1; }   /* __ltdf2, __ledf2: unordered is 1 */
static int cmp_gt(double a, double b) { return a > b ? 1 : a == b ? 0 : -1; }   /* __gtdf2, __gedf2: unordered is -1 */
static char outbuf[1 << 16];
static size_t outn;
static void flush_out(void) { fwrite(outbuf, 1, outn, stdout); fflush(stdout); outn = 0; }
static void write_fd(int fd, const char *p, size_t n)
{
	if (fd == 2) { flush_out(); fwrite(p, 1, n, stderr); return; }
	while (n) {
		size_t k = n < sizeof outbuf - outn ? n : sizeof outbuf - outn;
		memcpy(outbuf + outn, p, k);
		outn += k; p += k; n -= k;
		if (outn == sizeof outbuf) flush_out();
	}
}

static uint64_t hc_calls[128];   /* (CJI-4, RV32_PROFILE: the host calls made, by number, and where the last was made) */
static uint32_t hc_pc[128];
static void hostcall(uint32_t n)
{
	if (n < 128) hc_calls[n]++, hc_pc[n] = pc;
	switch (n) {
	case 1: flush_out(); if (getenv("RV32_STEPS")) fprintf(stderr, "rv32emu: %llu instructions\n", (unsigned long long)steps);
		if (getenv("RV32_SIZES")) fprintf(stderr, "rv32emu: the malloc arena reached %u bytes; its blocks in use held at most %u\n", heap_top - HEAP_BASE, live_max);   /* (CJI-4) */
		profile_report(); exit((int)x[10]);
	case 2: write_fd((int)x[10], str(x[11]), x[12]); x[10] = x[12]; break;
	case 3: {   /* vsnprintf(buf, n, fmt, ap) */
		char tmp[1 << 16];
		int r = format(tmp, sizeof tmp, str(x[12]), x[13]);
		if ((size_t)r >= sizeof tmp) die("vsnprintf: output longer than %zu", sizeof tmp);
		if (x[11]) { size_t k = (size_t)r < x[11] ? (size_t)r : x[11] - 1; check(x[10], (uint32_t)k + 1); memcpy(mem + x[10], tmp, k); mem[x[10] + k] = 0; }
		x[10] = (uint32_t)r;
		break;
	}
	case 4: {   /* strtod(s, &end) */
		char *e;
		double d = strtod(str(x[10]), &e);
		if (x[11]) st32(x[11], x[10] + (uint32_t)(e - str(x[10])));
		dret(d);
		break;
	}
	case 5: {   /* clock_gettime(clock, ts): ts is { int64 sec; int32 nsec } */
		struct timespec ts;
		clock_gettime(x[10] ? CLOCK_MONOTONIC : CLOCK_REALTIME, &ts);
		if (getenv("RV32_CLOCK")) {   /* CJI-4: the board's time, as the instructions run so far at 400 MHz, one per cycle */
			ts.tv_sec = (time_t)(steps / 400000000u);
			ts.tv_nsec = (long)(steps % 400000000u * 5 / 2);
		}
		st64(x[11], (uint64_t)ts.tv_sec);
		st32(x[11] + 8, (uint32_t)ts.tv_nsec);
		x[10] = 0;
		break;
	}
	case 6: {   /* localtime_r(&t, tm): tm is nine int32 fields, then tm_gmtoff (int32) */
		time_t t = (time_t)(int64_t)ld64(x[10]);
		struct tm tm;
		uint32_t o = x[11];
		localtime_r(&t, &tm);
		st32(o, (uint32_t)tm.tm_sec); st32(o + 4, (uint32_t)tm.tm_min); st32(o + 8, (uint32_t)tm.tm_hour);
		st32(o + 12, (uint32_t)tm.tm_mday); st32(o + 16, (uint32_t)tm.tm_mon); st32(o + 20, (uint32_t)tm.tm_year);
		st32(o + 24, (uint32_t)tm.tm_wday); st32(o + 28, (uint32_t)tm.tm_yday); st32(o + 32, (uint32_t)tm.tm_isdst);
		st32(o + 36, (uint32_t)tm.tm_gmtoff);
		x[10] = o;
		break;
	}
	case 7: x[10] = h_malloc(x[10]); break;
	case 8: h_free(x[10]); break;
	case 9: x[10] = h_realloc(x[10], x[11]); break;
	case 10: x[10] = (uint32_t)steps; x[11] = (uint32_t)(steps >> 32); break;   /* CJI-4: the instruction count so far */
	case 11: if (nwatch == 16) die("at most 16 watched ranges"); watch[nwatch] = (__typeof__(watch[0])){ x[10], x[11], 0 }; x[10] = (uint32_t)nwatch++; break;
	case 12: x[10] = x[10] < (uint32_t)nwatch ? watch[x[10]].peak : 0; break;   /* (the most of range a0 stored to) */
	case 13: {   /* CJI-4: a file of the machine's storage (the host's, relative to RV32_STORAGE if set) into the guest's
	                heap, NUL-terminated: a0 the path, a1 where to put its length; 0 when there is none */
		char path[4096];
		FILE *f;
		long n;
		uint32_t g = 0;
		snprintf(path, sizeof path, "%s%s%s", getenv("RV32_STORAGE") ? getenv("RV32_STORAGE") : "", getenv("RV32_STORAGE") ? "/" : "", str(x[10]));
		if ((f = fopen(path, "rb")) && !fseek(f, 0, SEEK_END) && (n = ftell(f)) >= 0 && !fseek(f, 0, SEEK_SET)
			&& (g = h_malloc((uint32_t)n + 1))) {
			if (fread(mem + g, 1, (size_t)n, f) != (size_t)n) die("cannot read %s", path);
			mem[g + (uint32_t)n] = 0;
			st32(x[11], (uint32_t)n);
		}
		if (f) fclose(f);
		x[10] = g;
		break;
	}
	case 14: {   /* CJI-4: a buffer of the guest's saved as a file of the machine's storage (relative to RV32_STORAGE if
	                set): a0 the path, a1 the buffer, a2 its length; 0, or -1 when it cannot be written */
		char path[4096];
		FILE *f;
		check(x[11], x[12]);
		snprintf(path, sizeof path, "%s%s%s", getenv("RV32_STORAGE") ? getenv("RV32_STORAGE") : "", getenv("RV32_STORAGE") ? "/" : "", str(x[10]));
		f = fopen(path, "wb");
		x[10] = f && fwrite(mem + x[11], 1, x[12], f) == x[12] ? 0 : (uint32_t)-1;
		if (f && fclose(f)) x[10] = (uint32_t)-1;
		break;
	}
	case 15: x[10] = live; x[11] = live_peak; live_peak = live; break;   /* CJI-4: the bytes malloc's blocks in use hold now
	                                                                         (a0), and the most since the last call (a1) */
	/* doubles: one argument */
	case 20: dret(sin(dreg(10))); break;
	case 21: dret(cos(dreg(10))); break;
	case 22: dret(tan(dreg(10))); break;
	case 23: dret(asin(dreg(10))); break;
	case 24: dret(acos(dreg(10))); break;
	case 25: dret(atan(dreg(10))); break;
	case 26: dret(sinh(dreg(10))); break;
	case 27: dret(cosh(dreg(10))); break;
	case 28: dret(tanh(dreg(10))); break;
	case 29: dret(asinh(dreg(10))); break;
	case 30: dret(acosh(dreg(10))); break;
	case 31: dret(atanh(dreg(10))); break;
	case 32: dret(exp(dreg(10))); break;
	case 33: dret(log(dreg(10))); break;
	case 34: dret(log10(dreg(10))); break;
	case 35: dret(log2(dreg(10))); break;
	case 36: dret(floor(dreg(10))); break;
	case 37: dret(sqrt(dreg(10))); break;
	case 38: dret(ceil(dreg(10))); break;
	case 39: dret(trunc(dreg(10))); break;
	case 45: dret(round(dreg(10))); break;
	case 46: dret(cbrt(dreg(10))); break;
	case 47: dret(fabs(dreg(10))); break;
	/* doubles: two arguments */
	case 40: dret(atan2(dreg(10), dreg(12))); break;
	case 41: dret(fmod(dreg(10), dreg(12))); break;
	case 42: dret(pow(dreg(10), dreg(12))); break;
	case 43: dret(hypot(dreg(10), dreg(12))); break;
	case 44: dret(nextafter(dreg(10), dreg(12))); break;
	/* soft-float: what the board's firmware gets from libgcc */
	case 50: dret(dreg(10) + dreg(12)); break;
	case 51: dret(dreg(10) - dreg(12)); break;
	case 52: dret(dreg(10) * dreg(12)); break;
	case 53: dret(dreg(10) / dreg(12)); break;
	case 54: dret(-dreg(10)); break;
	case 55: x[10] = !(dreg(10) == dreg(12)); break;           /* __eqdf2, __nedf2 */
	case 56: x[10] = (uint32_t)cmp_lt(dreg(10), dreg(12)); break; /* __ltdf2, __ledf2 */
	case 57: x[10] = (uint32_t)cmp_gt(dreg(10), dreg(12)); break; /* __gtdf2, __gedf2 */
	case 58: x[10] = isnan(dreg(10)) || isnan(dreg(12)); break;   /* __unorddf2 */
	case 59: dret((double)(int32_t)x[10]); break;               /* __floatsidf */
	case 60: dret((double)x[10]); break;                        /* __floatunsidf */
	case 61: dret((double)i64reg(10)); break;                   /* __floatdidf */
	case 62: dret((double)(uint64_t)i64reg(10)); break;         /* __floatundidf */
	case 63: x[10] = (uint32_t)(int32_t)dreg(10); break;        /* __fixdfsi */
	case 64: x[10] = (uint32_t)dreg(10); break;                 /* __fixunsdfsi */
	case 65: i64ret((int64_t)dreg(10)); break;                  /* __fixdfdi */
	case 66: i64ret((int64_t)(uint64_t)dreg(10)); break;        /* __fixunsdfdi */
	case 67: dret((double)freg(10)); break;                     /* __extendsfdf2 */
	case 68: fret((float)dreg(10)); break;                      /* __truncdfsf2 */
	case 69: x[10] = isnan(freg(10)) || isnan(freg(11)); break;  /* __unordsf2 (CJI-4: Float32Array's store) */
	/* 64-bit integers */
	case 70: i64ret(i64reg(12) ? i64reg(10) / i64reg(12) : 0); break;                       /* __divdi3 */
	case 71: i64ret(i64reg(12) ? (int64_t)((uint64_t)i64reg(10) / (uint64_t)i64reg(12)) : 0); break;   /* __udivdi3 */
	case 72: i64ret(i64reg(12) ? i64reg(10) % i64reg(12) : 0); break;                       /* __moddi3 */
	case 73: i64ret(i64reg(12) ? (int64_t)((uint64_t)i64reg(10) % (uint64_t)i64reg(12)) : 0); break;   /* __umoddi3 */
	case 74: i64ret((int64_t)((uint64_t)i64reg(10) * (uint64_t)i64reg(12))); break;        /* __muldi3 */
	case 75: i64ret((int64_t)((uint64_t)i64reg(10) << (x[12] & 63))); break;               /* __ashldi3 */
	case 76: i64ret((int64_t)((uint64_t)i64reg(10) >> (x[12] & 63))); break;               /* __lshrdi3 */
	case 77: i64ret(i64reg(10) >> (x[12] & 63)); break;                                    /* __ashrdi3 */
	default: die("host call %u at pc %#x", n, pc);
	}
}

typedef struct { char *name; uint32_t value; } sym;
/* RV32_TRACE=1: every call (jal/jalr that links ra) is printed with its target's name and a0..a5 */
static sym *funcs;
static int nfuncs, funcs_cap, tracing;
static void add_func(const char *name, uint32_t at)
{
	if (nfuncs == funcs_cap && !(funcs = realloc(funcs, sizeof *funcs * (size_t)(funcs_cap = 2 * funcs_cap + 256)))) die("out of memory");
	funcs[nfuncs++] = (sym){ strdup(name), at };
}
/* RV32_PROFILE=1: instructions counted by function (the nearest symbol at or below the pc) */
static uint32_t *prof;
static int by_value(const void *a, const void *b) { uint32_t x = ((const sym *)a)->value, y = ((const sym *)b)->value; return x < y ? -1 : x > y; }
static void profile_report(void)
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
static const char *func_at(uint32_t at)
{
	for (int i = 0; i < nfuncs; i++)
		if (funcs[i].value == at) return funcs[i].name;
	return "?";
}

/* ---- the C extension: each 16-bit instruction becomes the 32-bit one it stands for ---- */
static uint32_t bits(uint32_t v, int hi, int lo) { return (v >> lo) & ((1u << (hi - lo + 1)) - 1); }
static uint32_t enc_i(int32_t imm, uint32_t rs1, uint32_t f3, uint32_t rd, uint32_t op) { return ((uint32_t)imm & 0xfff) << 20 | rs1 << 15 | f3 << 12 | rd << 7 | op; }
static uint32_t enc_s(int32_t imm, uint32_t rs2, uint32_t rs1, uint32_t f3, uint32_t op)
{
	return bits((uint32_t)imm, 11, 5) << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | bits((uint32_t)imm, 4, 0) << 7 | op;
}
static uint32_t enc_b(int32_t imm, uint32_t rs2, uint32_t rs1, uint32_t f3)
{
	uint32_t m = (uint32_t)imm;
	return bits(m, 12, 12) << 31 | bits(m, 10, 5) << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | bits(m, 4, 1) << 8 | bits(m, 11, 11) << 7 | 0x63;
}
static uint32_t enc_j(int32_t imm, uint32_t rd)
{
	uint32_t m = (uint32_t)imm;
	return bits(m, 20, 20) << 31 | bits(m, 10, 1) << 21 | bits(m, 11, 11) << 20 | bits(m, 19, 12) << 12 | rd << 7 | 0x6f;
}
static uint32_t enc_r(uint32_t f7, uint32_t rs2, uint32_t rs1, uint32_t f3, uint32_t rd) { return f7 << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | rd << 7 | 0x33; }
static int32_t sxb(uint32_t v, int nbits) { return (int32_t)(v << (32 - nbits)) >> (32 - nbits); }
static uint32_t expand_c(uint32_t c, uint32_t pc)
{
	uint32_t f3 = bits(c, 15, 13), rd = bits(c, 11, 7), rs2 = bits(c, 6, 2), rdp = bits(c, 4, 2) + 8, rs1p = bits(c, 9, 7) + 8;
	int32_t imm6 = sxb(bits(c, 12, 12) << 5 | bits(c, 6, 2), 6);
	switch (c & 3) {
	case 0:
		switch (f3) {
		case 0: {   /* c.addi4spn */
			uint32_t u = bits(c, 12, 11) << 4 | bits(c, 10, 7) << 6 | bits(c, 6, 6) << 2 | bits(c, 5, 5) << 3;
			if (!u) break;
			return enc_i((int32_t)u, 2, 0, rdp, 0x13);
		}
		case 2: return enc_i((int32_t)(bits(c, 12, 10) << 3 | bits(c, 6, 6) << 2 | bits(c, 5, 5) << 6), rs1p, 2, rdp, 0x03);   /* c.lw */
		case 6: return enc_s((int32_t)(bits(c, 12, 10) << 3 | bits(c, 6, 6) << 2 | bits(c, 5, 5) << 6), rdp, rs1p, 2, 0x23);  /* c.sw */
		}
		break;
	case 1:
		switch (f3) {
		case 0: return enc_i(imm6, rd, 0, rd, 0x13);   /* c.addi, c.nop */
		case 1: case 5: {                              /* c.jal, c.j */
			int32_t off = sxb(bits(c, 12, 12) << 11 | bits(c, 11, 11) << 4 | bits(c, 10, 9) << 8 | bits(c, 8, 8) << 10 | bits(c, 7, 7) << 6
				| bits(c, 6, 6) << 7 | bits(c, 5, 3) << 1 | bits(c, 2, 2) << 5, 12);
			return enc_j(off, f3 == 1 ? 1 : 0);
		}
		case 2: return enc_i(imm6, 0, 0, rd, 0x13);    /* c.li */
		case 3:
			if (rd == 2) {                             /* c.addi16sp */
				int32_t m = sxb(bits(c, 12, 12) << 9 | bits(c, 6, 6) << 4 | bits(c, 5, 5) << 6 | bits(c, 4, 3) << 7 | bits(c, 2, 2) << 5, 10);
				if (!m) break;
				return enc_i(m, 2, 0, 2, 0x13);
			}
			if (!imm6) break;
			return ((uint32_t)imm6 << 12 & 0xfffff000u) | rd << 7 | 0x37;   /* c.lui */
		case 4: {
			uint32_t sh = bits(c, 6, 2) | bits(c, 12, 12) << 5;
			switch (bits(c, 11, 10)) {
			case 0: return enc_i((int32_t)sh, rs1p, 5, rs1p, 0x13);                 /* c.srli */
			case 1: return enc_i((int32_t)(sh | 0x400), rs1p, 5, rs1p, 0x13);       /* c.srai */
			case 2: return enc_i(imm6, rs1p, 7, rs1p, 0x13);                         /* c.andi */
			case 3:
				if (bits(c, 12, 12)) break;
				switch (bits(c, 6, 5)) {
				case 0: return enc_r(0x20, rdp, rs1p, 0, rs1p);   /* c.sub */
				case 1: return enc_r(0, rdp, rs1p, 4, rs1p);      /* c.xor */
				case 2: return enc_r(0, rdp, rs1p, 6, rs1p);      /* c.or */
				case 3: return enc_r(0, rdp, rs1p, 7, rs1p);      /* c.and */
				}
			}
			break;
		}
		case 6: case 7: {                              /* c.beqz, c.bnez */
			int32_t off = sxb(bits(c, 12, 12) << 8 | bits(c, 11, 10) << 3 | bits(c, 6, 5) << 6 | bits(c, 4, 3) << 1 | bits(c, 2, 2) << 5, 9);
			return enc_b(off, 0, rs1p, f3 == 6 ? 0 : 1);
		}
		}
		break;
	case 2:
		switch (f3) {
		case 0: return enc_i((int32_t)(bits(c, 6, 2) | bits(c, 12, 12) << 5), rd, 1, rd, 0x13);   /* c.slli */
		case 2: if (!rd) break;                                                                 /* c.lwsp */
			return enc_i((int32_t)(bits(c, 12, 12) << 5 | bits(c, 6, 4) << 2 | bits(c, 3, 2) << 6), 2, 2, rd, 0x03);
		case 4:
			if (!bits(c, 12, 12)) {
				if (!rs2) { if (!rd) break; return enc_i(0, rd, 0, 0, 0x67); }   /* c.jr */
				return enc_r(0, rs2, 0, 0, rd);                                      /* c.mv */
			}
			if (!rs2) { if (!rd) break; return enc_i(0, rd, 0, 1, 0x67); }       /* c.jalr (c.ebreak: rd 0) */
			return enc_r(0, rs2, rd, 0, rd);                                         /* c.add */
		case 6: return enc_s((int32_t)(bits(c, 12, 9) << 2 | bits(c, 8, 7) << 6), rs2, 2, 2, 0x23);   /* c.swsp */
		}
		break;
	}
	die("compressed instruction %#x at pc %#x", c, pc);
	return 0;
}

/* ---- the processor: RV32IMC ---- */
static inline int32_t sx(uint32_t v, int bits) { return (int32_t)(v << (32 - bits)) >> (32 - bits); }
static void run(void)
{
	for (;;) {
		uint32_t i = ld16(pc), len = 2;
		if ((i & 3) != 3) i = expand_c(i, pc);   /* the C extension: 16 bits */
		else i = ld32(pc), len = 4;
		uint32_t op = i & 0x7f, rd = (i >> 7) & 31, f3 = (i >> 12) & 7, rs1 = (i >> 15) & 31, rs2 = (i >> 20) & 31, f7 = i >> 25;
		uint32_t a = x[rs1], b = x[rs2], next = pc + len, v = 0;
		int wr = 1;
		steps++;
		if (prof) prof[pc >> 1]++;
		switch (op) {
		case 0x37: v = i & 0xfffff000; break;                          /* lui */
		case 0x17: v = pc + (i & 0xfffff000); break;                   /* auipc */
		case 0x6f: v = next; next = pc + (uint32_t)(sx(((i >> 31) << 20) | (((i >> 12) & 0xff) << 12) | (((i >> 20) & 1) << 11) | (((i >> 21) & 0x3ff) << 1), 21)); break;   /* jal */
		case 0x67: v = next; next = (a + (uint32_t)sx(i >> 20, 12)) & ~1u; break;   /* jalr */
		}
		if (tracing && (op == 0x6f || op == 0x67) && (rd == 1 || (rd == 0 && rs1 != 1 && op == 0x67)))
			fprintf(stderr, "%s %s(%#x %#x %#x %#x %#x %#x) sp=%#x s1=%#x from %#x\n", rd ? "call" : "tail", func_at(next),
				x[10], x[11], x[12], x[13], x[14], x[15], x[2], x[9], pc);
		switch (op) {
		case 0x37: case 0x17: case 0x6f: case 0x67: break;
		case 0x63: {                                                   /* branches */
			int t;
			wr = 0;
			switch (f3) {
			case 0: t = a == b; break;
			case 1: t = a != b; break;
			case 4: t = (int32_t)a < (int32_t)b; break;
			case 5: t = (int32_t)a >= (int32_t)b; break;
			case 6: t = a < b; break;
			case 7: t = a >= b; break;
			default: die("branch %#x at %#x", i, pc);
			}
			if (t) next = pc + (uint32_t)sx(((i >> 31) << 12) | (((i >> 7) & 1) << 11) | (((i >> 25) & 0x3f) << 5) | (((i >> 8) & 0xf) << 1), 13);
			break;
		}
		case 0x03: {                                                   /* loads */
			uint32_t ad = a + (uint32_t)sx(i >> 20, 12);
			switch (f3) {
			case 0: v = (uint32_t)(int8_t)ld8(ad); break;
			case 1: v = (uint32_t)(int16_t)ld16(ad); break;
			case 2: v = ld32(ad); break;
			case 4: v = ld8(ad); break;
			case 5: v = ld16(ad); break;
			default: die("load %#x at %#x", i, pc);
			}
			break;
		}
		case 0x23: {                                                   /* stores */
			uint32_t ad = a + (uint32_t)sx(((i >> 25) << 5) | ((i >> 7) & 31), 12);
			wr = 0;
			switch (f3) {
			case 0: st8(ad, (uint8_t)b); break;
			case 1: st16(ad, (uint16_t)b); break;
			case 2: st32(ad, b); break;
			default: die("store %#x at %#x", i, pc);
			}
			break;
		}
		case 0x13: {                                                   /* immediates */
			uint32_t imm = (uint32_t)sx(i >> 20, 12), sh = (i >> 20) & 31;
			switch (f3) {
			case 0: v = a + imm; break;
			case 2: v = (int32_t)a < (int32_t)imm; break;
			case 3: v = a < imm; break;
			case 4: v = a ^ imm; break;
			case 6: v = a | imm; break;
			case 7: v = a & imm; break;
			case 1: v = a << sh; break;
			case 5: v = (i >> 30) & 1 ? (uint32_t)((int32_t)a >> sh) : a >> sh; break;
			}
			break;
		}
		case 0x33:                                                     /* registers */
			if (f7 == 1) {
				switch (f3) {
				case 0: v = a * b; break;
				case 1: v = (uint32_t)(((int64_t)(int32_t)a * (int64_t)(int32_t)b) >> 32); break;
				case 2: v = (uint32_t)(((int64_t)(int32_t)a * (int64_t)(uint64_t)b) >> 32); break;
				case 3: v = (uint32_t)(((uint64_t)a * (uint64_t)b) >> 32); break;
				case 4: v = b == 0 ? 0xffffffffu : ((int32_t)a == INT32_MIN && (int32_t)b == -1) ? a : (uint32_t)((int32_t)a / (int32_t)b); break;
				case 5: v = b == 0 ? 0xffffffffu : a / b; break;
				case 6: v = b == 0 ? a : ((int32_t)a == INT32_MIN && (int32_t)b == -1) ? 0 : (uint32_t)((int32_t)a % (int32_t)b); break;
				case 7: v = b == 0 ? a : a % b; break;
				}
			} else {
				switch (f3) {
				case 0: v = f7 == 0x20 ? a - b : a + b; break;
				case 1: v = a << (b & 31); break;
				case 2: v = (int32_t)a < (int32_t)b; break;
				case 3: v = a < b; break;
				case 4: v = a ^ b; break;
				case 5: v = f7 == 0x20 ? (uint32_t)((int32_t)a >> (b & 31)) : a >> (b & 31); break;
				case 6: v = a | b; break;
				case 7: v = a & b; break;
				}
			}
			break;
		case 0x0f: wr = 0; break;                                     /* fence */
		case 0x73:                                                     /* ecall: a host call, its number in a7 */
			wr = 0;
			if (i == 0x00000073) hostcall(x[17]);
			else if (i == 0x00100073) die("ebreak at %#x", pc);
			else die("system instruction %#x at %#x", i, pc);
			break;
		default:
			die("instruction %#x at pc %#x", i, pc);
		}
		if (wr && rd) x[rd] = v;
		pc = next;
	}
}

/* ---- loading: the firmware (an executable) and a module (a relocatable object) ---- */
static sym *fw_syms;
static int nfw_syms;
static uint32_t fw_sym(const char *name)
{
	for (int i = 0; i < nfw_syms; i++)
		if (!strcmp(fw_syms[i].name, name)) return fw_syms[i].value;
	return 0;
}
static uint8_t *slurp(const char *path, size_t *n)
{
	FILE *f = fopen(path, "rb");
	uint8_t *d;
	if (!f) die("cannot open %s", path);
	fseek(f, 0, SEEK_END);
	*n = (size_t)ftell(f);
	rewind(f);
	if (!(d = malloc(*n)) || fread(d, 1, *n, f) != *n) die("cannot read %s", path);
	fclose(f);
	return d;
}
static uint32_t load_firmware(const char *path, uint32_t *end)
{
	size_t n;
	uint8_t *d = slurp(path, &n);
	Elf32_Ehdr *h = (Elf32_Ehdr *)d;
	Elf32_Shdr *sh;
	if (n < sizeof *h || memcmp(h->e_ident, ELFMAG, 4) || h->e_machine != EM_RISCV || h->e_type != ET_EXEC) die("%s: not an rv32 executable", path);
	*end = 0;
	for (int k = 0; k < h->e_phnum; k++) {
		Elf32_Phdr *p = (Elf32_Phdr *)(d + h->e_phoff + (size_t)k * h->e_phentsize);
		if (p->p_type != PT_LOAD) continue;
		check(p->p_vaddr, p->p_memsz);
		memcpy(mem + p->p_vaddr, d + p->p_offset, p->p_filesz);
		if (p->p_vaddr + p->p_memsz > *end) *end = p->p_vaddr + p->p_memsz;
	}
	sh = (Elf32_Shdr *)(d + h->e_shoff);
	for (int k = 0; k < h->e_shnum; k++)
		if (sh[k].sh_type == SHT_SYMTAB) {
			Elf32_Sym *s = (Elf32_Sym *)(d + sh[k].sh_offset);
			const char *names = (const char *)d + sh[sh[k].sh_link].sh_offset;
			int count = (int)(sh[k].sh_size / sizeof *s);
			fw_syms = calloc((size_t)count, sizeof *fw_syms);
			for (int j = 0; j < count; j++)
				if (s[j].st_shndx != SHN_UNDEF && ELF32_ST_BIND(s[j].st_info) != STB_LOCAL)
					fw_syms[nfw_syms++] = (sym){ strdup(names + s[j].st_name), s[j].st_value };
				else if (s[j].st_shndx != SHN_UNDEF && ELF32_ST_TYPE(s[j].st_info) == STT_FUNC)
					add_func(names + s[j].st_name, s[j].st_value);
			for (int j = 0; j < nfw_syms; j++)
				add_func(fw_syms[j].name, fw_syms[j].value);
		}
	return h->e_entry;
}

/* a module: its allocated sections one after another from `at`, its relocations applied, its
   undefined symbols the firmware's; returns the address of each global symbol through `module_sym` */
static sym *mod_syms;
static int nmod_syms;
static uint32_t module_sym(const char *name)
{
	for (int i = 0; i < nmod_syms; i++)
		if (!strcmp(mod_syms[i].name, name)) return mod_syms[i].value;
	return 0;
}
static uint32_t load_module(const char *path, uint32_t at)
{
	size_t n;
	uint8_t *d = slurp(path, &n);
	Elf32_Ehdr *h = (Elf32_Ehdr *)d;
	Elf32_Shdr *sh;
	uint32_t *base;
	Elf32_Sym *syms = NULL;
	const char *names = NULL;
	int nsyms = 0;
	if (n < sizeof *h || memcmp(h->e_ident, ELFMAG, 4) || h->e_machine != EM_RISCV || h->e_type != ET_REL) die("%s: not an rv32 relocatable object", path);
	sh = (Elf32_Shdr *)(d + h->e_shoff);
	base = calloc(h->e_shnum, sizeof *base);
	for (int k = 0; k < h->e_shnum; k++)
		if (sh[k].sh_flags & SHF_ALLOC) {
			uint32_t al = sh[k].sh_addralign ? sh[k].sh_addralign : 1;
			at = (at + al - 1) / al * al;
			base[k] = at;
			check(at, sh[k].sh_size ? sh[k].sh_size : 1);
			if (sh[k].sh_type != SHT_NOBITS) memcpy(mem + at, d + sh[k].sh_offset, sh[k].sh_size);
			at += sh[k].sh_size;
		} else if (sh[k].sh_type == SHT_SYMTAB) {
			syms = (Elf32_Sym *)(d + sh[k].sh_offset);
			nsyms = (int)(sh[k].sh_size / sizeof *syms);
			names = (const char *)d + sh[sh[k].sh_link].sh_offset;
		}
	uint32_t *value = calloc((size_t)nsyms + 1, sizeof *value);
	mod_syms = calloc((size_t)nsyms + 1, sizeof *mod_syms);
	for (int j = 0; j < nsyms; j++) {
		const char *nm = names + syms[j].st_name;
		if (syms[j].st_shndx == SHN_UNDEF) {
			if (j && !(value[j] = fw_sym(nm)) && ELF32_ST_BIND(syms[j].st_info) != STB_WEAK) die("%s: the firmware has no %s", path, nm);
		} else if (syms[j].st_shndx < h->e_shnum)
			value[j] = base[syms[j].st_shndx] + syms[j].st_value;
		if (syms[j].st_shndx != SHN_UNDEF && ELF32_ST_BIND(syms[j].st_info) != STB_LOCAL)
			mod_syms[nmod_syms++] = (sym){ strdup(nm), value[j] };
		if (syms[j].st_shndx != SHN_UNDEF && ELF32_ST_TYPE(syms[j].st_info) == STT_FUNC)
			add_func(nm, value[j]);
	}
	for (int k = 0; k < h->e_shnum; k++)
		if (sh[k].sh_type == SHT_RELA && (sh[sh[k].sh_info].sh_flags & SHF_ALLOC)) {
			Elf32_Rela *r = (Elf32_Rela *)(d + sh[k].sh_offset);
			for (size_t j = 0; j < sh[k].sh_size / sizeof *r; j++) {
				uint32_t where = base[sh[k].sh_info] + r[j].r_offset, s = value[ELF32_R_SYM(r[j].r_info)];
				switch (ELF32_R_TYPE(r[j].r_info)) {
				case R_RISCV_32: st32(where, s + (uint32_t)r[j].r_addend); break;
				case R_RISCV_CALL: case R_RISCV_CALL_PLT: {   /* auipc + jalr (objects from a C compiler, for tests) */
					uint32_t v = s + (uint32_t)r[j].r_addend - where, hi = (v + 0x800) & 0xfffff000u;
					st32(where, (ld32(where) & 0xfff) | hi);
					st32(where + 4, (ld32(where + 4) & 0xfffff) | ((v - hi) << 20));
					break;
				}
				default: die("%s: relocation type %u", path, ELF32_R_TYPE(r[j].r_info));
				}
			}
		}
	return at;
}


/* ---- CJI-4 (chapter 30): a module as the board loads it --------------------------------------
 * An ELF32 shared object, loaded as Espressif's elf_loader 2.0 loads one for picocalc-os's
 * native_elf_p4.c (ttmp/CJI-4-worlds-on-the-board/design-doc/01-design.md, section 1.1, lists what
 * is assumed of it and where each assumption comes from): the header is checked as native_elf_p4.c
 * checks it (A1); the PT_LOAD segments go into one zeroed block, from the first one's address to
 * the end of the last one's memsz (A2), whose size is what the world is charged (A3); the
 * relocations of every SHT_RELA section are applied through its symbol table (A4), and only
 * R_RISCV_32, R_RISCV_RELATIVE and R_RISCV_JUMP_SLOT (A5, A6, A7), each at a 4-byte-aligned place
 * inside the block (A9); a name is looked up only in the firmware's table fw_resolve, and a name it
 * does not have stops the load with native_elf_p4.c's message (A10); a named relocation is always
 * resolved by name, even when the module defines the name (A8); the entry is e_entry, in file-backed
 * code (A11). Anything else is refused. */
static uint32_t fw_resolve_name(const char *name)
{
	uint32_t t = fw_sym("fw_resolve"), n = fw_sym("fw_nresolve");
	if (!t || !n) die("the firmware has no resolve table (fw_resolve, fw_nresolve)");
	n = ld32(n);
	for (uint32_t i = 0; i < n; i++)
		if (!strcmp(str(ld32(t + 8 * i)), name)) return ld32(t + 8 * i + 4);
	return 0;
}
static uint32_t load_shared(const char *path, uint32_t at, uint32_t *entry, uint32_t *size)
{
	size_t n;
	uint8_t *d = slurp(path, &n);
	Elf32_Ehdr *h = (Elf32_Ehdr *)d;
	Elf32_Shdr *sh;
	uint32_t vs = 0, ve = 0, base;
	int first = 1, entry_ok = 0;
	if (n < sizeof *h || memcmp(h->e_ident, ELFMAG, 4)) die("%s is not an ELF module", path);
	if (h->e_ident[EI_CLASS] != ELFCLASS32 || h->e_machine != EM_RISCV || (h->e_flags & 0x6) != 0x2)
		die("%s is not built for this board (32-bit RISC-V, ilp32f)", path);
	if (h->e_type != ET_DYN) die("%s: not a shared object", path);
	if (h->e_phoff + (size_t)h->e_phnum * sizeof(Elf32_Phdr) > n || h->e_shoff + (size_t)h->e_shnum * sizeof(Elf32_Shdr) > n)
		die("%s: headers past the end of the file", path);
	for (int k = 0; k < h->e_phnum; k++) {
		Elf32_Phdr *p = (Elf32_Phdr *)(d + h->e_phoff + (size_t)k * sizeof *p);
		if (p->p_type != PT_LOAD) continue;
		if (p->p_memsz < p->p_filesz || (size_t)p->p_offset + p->p_filesz > n) die("%s: a bad segment", path);
		if (first) vs = p->p_vaddr, first = 0;
		if (p->p_vaddr < vs) die("%s: segments out of order", path);
		if (p->p_vaddr + p->p_memsz > ve) ve = p->p_vaddr + p->p_memsz;
	}
	if (first) die("%s: no PT_LOAD segment", path);
	base = (at + 15) & ~15u;
	*size = ve - vs;
	check(base, *size);
	memset(mem + base, 0, *size);
	for (int k = 0; k < h->e_phnum; k++) {
		Elf32_Phdr *p = (Elf32_Phdr *)(d + h->e_phoff + (size_t)k * sizeof *p);
		if (p->p_type != PT_LOAD) continue;
		memcpy(mem + base + (p->p_vaddr - vs), d + p->p_offset, p->p_filesz);
		if ((p->p_flags & PF_X) && h->e_entry >= p->p_vaddr && h->e_entry < p->p_vaddr + p->p_filesz) entry_ok = 1;
	}
	if (!entry_ok) die("%s: the entry %#x is not in file-backed code", path, h->e_entry);
	*entry = base + (h->e_entry - vs);
	sh = (Elf32_Shdr *)(d + h->e_shoff);
	for (int k = 0; k < h->e_shnum; k++) {
		Elf32_Shdr *ss, *strs;
		Elf32_Sym *syms;
		Elf32_Rela *r;
		if (sh[k].sh_type == SHT_REL) die("%s: SHT_REL relocations (elf_loader takes RELA)", path);
		if (sh[k].sh_type != SHT_RELA) continue;
		if (sh[k].sh_link >= h->e_shnum || (sh[sh[k].sh_link].sh_type != SHT_DYNSYM && sh[sh[k].sh_link].sh_type != SHT_SYMTAB))
			die("%s: relocations without a symbol table", path);
		ss = &sh[sh[k].sh_link];
		strs = &sh[ss->sh_link];
		syms = (Elf32_Sym *)(d + ss->sh_offset);
		r = (Elf32_Rela *)(d + sh[k].sh_offset);
		for (size_t j = 0; j < sh[k].sh_size / sizeof *r; j++) {
			uint32_t type = ELF32_R_TYPE(r[j].r_info), si = ELF32_R_SYM(r[j].r_info), where, v = 0;
			const char *name;
			if (si >= ss->sh_size / sizeof *syms) die("%s: a relocation's symbol %u is past its table", path, si);
			name = (const char *)d + strs->sh_offset + syms[si].st_name;
			if (r[j].r_offset < vs || r[j].r_offset + 4 > ve) die("%s: a relocation at %#x, outside the module", path, r[j].r_offset);
			where = base + (r[j].r_offset - vs);
			if (where & 3) die("%s: a relocation at %#x, not 4-byte aligned", path, r[j].r_offset);
			if (type == R_RISCV_32 || type == R_RISCV_JUMP_SLOT) {
				if (!si || !name[0]) die("%s: an unnamed relocation of type %u at %#x", path, type, r[j].r_offset);
				if (!(v = fw_resolve_name(name))) die("it links to %s, which picocalc-os does not give a module", name);
				st32(where, type == R_RISCV_32 ? v + (uint32_t)r[j].r_addend : v);
			} else if (type == R_RISCV_RELATIVE)
				st32(where, base - vs + (uint32_t)r[j].r_addend);
			else
				die("%s: relocation type %u (elf_loader applies only R_RISCV_32, R_RISCV_RELATIVE and R_RISCV_JUMP_SLOT)", path, type);
		}
	}
	for (int k = 0; k < h->e_shnum; k++)   /* (a .symtab, not loaded: names for the trace and the profile) */
		if (sh[k].sh_type == SHT_SYMTAB) {
			Elf32_Sym *s = (Elf32_Sym *)(d + sh[k].sh_offset);
			const char *names = (const char *)d + sh[sh[k].sh_link].sh_offset;
			for (size_t j = 0; j < sh[k].sh_size / sizeof *s; j++)
				if (ELF32_ST_TYPE(s[j].st_info) == STT_FUNC && s[j].st_shndx != SHN_UNDEF)
					add_func(names + s[j].st_name, base + (s[j].st_value - vs));
		}
	free(d);
	return base + *size;
}

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
