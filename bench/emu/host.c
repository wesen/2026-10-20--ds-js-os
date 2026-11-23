/* rv32emu: the heap the firmware's malloc hands out, printf, and the host calls the firmware's library makes. */
#include "machine.h"

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

uint64_t hc_calls[128];   /* (CJI-4, RV32_PROFILE: the host calls made, by number, and where the last was made) */
uint32_t hc_pc[128];
void hostcall(uint32_t n)
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
