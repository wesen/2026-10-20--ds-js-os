/* Chapter 29: the rest of the rv32 test firmware's C library, written here (hostcalls.S has the
   calls the machine answers). Only what runtime.c and the firmware's main use. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

extern _Noreturn void _hc_exit(int status);
extern long _hc_write(int fd, const void *p, size_t n);
extern int _hc_vsnprintf(char *b, size_t n, const char *f, va_list ap);

/* (a word at a time when both are aligned, as newlib's does: the collector copies objects with it) */
void *memcpy(void *d, const void *s, size_t n)
{
	unsigned char *a = d;
	const unsigned char *b = s;
	if ((((uintptr_t)a | (uintptr_t)b) & 3) == 0) {
		for (; n >= 4; n -= 4, a += 4, b += 4)
			*(uint32_t *)a = *(const uint32_t *)b;
	}
	while (n--)
		*a++ = *b++;
	return d;
}
void *memmove(void *d, const void *s, size_t n)
{
	unsigned char *a = d;
	const unsigned char *b = s;
	if (a < b) while (n--) *a++ = *b++;
	else while (n--) a[n] = b[n];
	return d;
}
void *memset(void *d, int c, size_t n) { unsigned char *a = d; while (n--) *a++ = (unsigned char)c; return d; }
void *memchr(const void *s, int c, size_t n) { const unsigned char *p = s; for (; n; n--, p++) if (*p == (unsigned char)c) return (void *)p; return 0; }
int memcmp(const void *x, const void *y, size_t n)
{
	const unsigned char *a = x, *b = y;
	for (; n; n--, a++, b++) if (*a != *b) return *a - *b;
	return 0;
}
size_t strlen(const char *s) { size_t n = 0; while (s[n]) n++; return n; }
int strcmp(const char *a, const char *b) { while (*a && *a == *b) a++, b++; return (unsigned char)*a - (unsigned char)*b; }
int strncmp(const char *a, const char *b, size_t n) { for (; n; n--, a++, b++) { if (*a != *b || !*a) return (unsigned char)*a - (unsigned char)*b; } return 0; }
char *strcpy(char *d, const char *s) { char *r = d; while ((*d++ = *s++)) {} return r; }
/* (CJI-4: for the files in memory and for slas on the board) */
char *strncpy(char *d, const char *s, size_t n) { size_t k = 0; for (; k < n && s[k]; k++) d[k] = s[k]; for (; k < n; k++) d[k] = 0; return d; }
char *strrchr(const char *s, int c) { const char *r = NULL; for (;; s++) { if (*s == (char)c) r = s; if (!*s) return (char *)r; } }
char *strstr(const char *h, const char *n) { size_t k = strlen(n); for (; *h; h++) if (!strncmp(h, n, k)) return (char *)h; return k ? NULL : (char *)h; }
char *strchr(const char *s, int c) { for (;; s++) { if (*s == (char)c) return (char *)s; if (!*s) return NULL; } }
size_t strspn(const char *s, const char *set) { size_t n = 0; while (s[n] && strchr(set, s[n])) n++; return n; }
size_t strcspn(const char *s, const char *set) { size_t n = 0; while (s[n] && !strchr(set, s[n])) n++; return n; }

int isdigit(int c) { return c >= '0' && c <= '9'; }
int isupper(int c) { return c >= 'A' && c <= 'Z'; }
int islower(int c) { return c >= 'a' && c <= 'z'; }
int isalpha(int c) { return isupper(c) || islower(c); }
int isalnum(int c) { return isalpha(c) || isdigit(c); }
int isspace(int c) { return c == ' ' || (c >= '\t' && c <= '\r'); }
int isxdigit(int c) { return isdigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
int isprint(int c) { return c >= 32 && c < 127; }
int tolower(int c) { return isupper(c) ? c + 32 : c; }
int toupper(int c) { return islower(c) ? c - 32 : c; }

void *calloc(size_t n, size_t size) { void *p = malloc(n * size); if (p) memset(p, 0, n * size); return p; }
_Noreturn void exit(int status) { fflush(stdout); _hc_exit(status); }
_Noreturn void abort(void) { _hc_exit(134); }
int abs(int v) { return v < 0 ? -v : v; }
long strtol(const char *s, char **end, int base)
{
	long v = 0;
	int neg = 0;
	while (isspace(*s)) s++;
	if (*s == '-' || *s == '+') neg = *s++ == '-';
	if ((base == 0 || base == 16) && s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) { s += 2; base = 16; }
	if (!base) base = *s == '0' ? 8 : 10;
	for (;; s++) {
		int d = isdigit(*s) ? *s - '0' : islower(*s) ? *s - 'a' + 10 : isupper(*s) ? *s - 'A' + 10 : 99;
		if (d >= base) break;
		v = v * base + d;
	}
	if (end) *end = (char *)s;
	return neg ? -v : v;
}
int atoi(const char *s) { return (int)strtol(s, NULL, 10); }
long atol(const char *s) { return strtol(s, NULL, 10); }   /* (CJI-4) */
/* (CJI-4: for slas on the board) */
unsigned long long strtoull(const char *s, char **end, int base)
{
	unsigned long long v = 0;
	int neg = 0;
	while (isspace(*s)) s++;
	if (*s == '-' || *s == '+') neg = *s++ == '-';
	if ((base == 0 || base == 16) && s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) { s += 2; base = 16; }
	if (!base) base = *s == '0' ? 8 : 10;
	for (;; s++) {
		int d = isdigit(*s) ? *s - '0' : islower(*s) ? *s - 'a' + 10 : isupper(*s) ? *s - 'A' + 10 : 99;
		if (d >= base) break;
		v = v * (unsigned)base + (unsigned)d;
	}
	if (end) *end = (char *)s;
	return neg ? -v : v;
}
long long strtoll(const char *s, char **end, int base) { return (long long)strtoull(s, end, base); }
unsigned long strtoul(const char *s, char **end, int base) { return (unsigned long)strtoull(s, end, base); }
void *bsearch(const void *key, const void *base, size_t n, size_t size, int (*cmp)(const void *, const void *))
{
	size_t lo = 0, hi = n;
	while (lo < hi) {
		size_t mid = (lo + hi) / 2;
		int c = cmp(key, (const char *)base + mid * size);
		if (!c) return (void *)((const char *)base + mid * size);
		if (c < 0) hi = mid; else lo = mid + 1;
	}
	return NULL;
}
static void swap_bytes(char *a, char *b, size_t n) { while (n--) { char t = *a; *a++ = *b; *b++ = t; } }
void qsort(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *))   /* (a shell sort: small lists) */
{
	char *b = base;
	for (size_t gap = n / 2; gap > 0; gap /= 2)
		for (size_t i = gap; i < n; i++)
			for (size_t j = i; j >= gap && cmp(b + (j - gap) * size, b + j * size) > 0; j -= gap)
				swap_bytes(b + (j - gap) * size, b + j * size, size);
}
/* (slas.c's build-time snapshot names these; it never runs on the board) */
int dup(int fd) { (void)fd; return -1; }
int dup2(int a, int b) { (void)a; (void)b; return -1; }
int close(int fd) { (void)fd; return -1; }
struct stat;
int fstat(int fd, struct stat *st) { (void)fd; (void)st; return -1; }
char *strdup(const char *s) { size_t n = strlen(s) + 1; char *d = malloc(n); if (d) memcpy(d, s, n); return d; }
/* (slas.c reads a snapshot's text with sscanf; slas on the board takes none, so this one matches nothing) */
int sscanf(const char *s, const char *f, ...) { (void)s; (void)f; return 0; }

int vsnprintf(char *b, size_t n, const char *f, va_list ap) { return _hc_vsnprintf(b, n, f, ap); }
int snprintf(char *b, size_t n, const char *f, ...) { va_list ap; int r; va_start(ap, f); r = _hc_vsnprintf(b, n, f, ap); va_end(ap); return r; }
int sprintf(char *b, const char *f, ...) { va_list ap; int r; va_start(ap, f); r = _hc_vsnprintf(b, (size_t)1 << 30, f, ap); va_end(ap); return r; }
/* CJI-4 (compiling on the board): a FILE is a descriptor (stdin, stdout, stderr: the machine's) or a buffer, as
   newlib's fmemopen, open_memstream and tmpfile give the board's firmware: the compiler's source comes from a buffer
   the firmware registers (fw_file_put) or from the machine's storage (host call 13), its SLIR goes to a buffer, its
   spills to a memory file, and what slas writes stays in memory for the firmware to load. */
enum { F_MEM = 1, F_READ = 2, F_WRITE = 4, F_STREAM = 8, F_OWN = 16, F_KEEP = 32 };
extern void *_hc_load(const char *path, size_t *len);   /* (host call 13: a file of the machine's storage) */
static FILE in = { 0 }, out = { 1 }, err = { 2 };
FILE *stdin = &in, *stdout = &out, *stderr = &err;

/* the firmware's named buffers: what fopen finds first */
typedef struct { char name[96]; char *buf; size_t len; } fw_file_t;
static fw_file_t *fw_files;
static int nfw_files, fw_files_cap;
static fw_file_t *fw_file(const char *name)
{
	for (int i = 0; i < nfw_files; i++)
		if (!strcmp(fw_files[i].name, name))
			return &fw_files[i];
	return NULL;
}
int fw_file_put(const char *name, const void *buf, size_t len)   /* (a copy is kept) */
{
	fw_file_t *f = fw_file(name);
	if (!f) {
		if (nfw_files == fw_files_cap && !(fw_files = realloc(fw_files, sizeof *fw_files * (size_t)(fw_files_cap = 2 * fw_files_cap + 8))))
			return -1;
		f = &fw_files[nfw_files++];
		memset(f, 0, sizeof *f);
		strncpy(f->name, name, sizeof f->name - 1);
	}
	free(f->buf);
	if (!(f->buf = malloc(len + 1)))
		return -1;
	memcpy(f->buf, buf, len);
	f->buf[len] = 0;
	f->len = len;
	return 0;
}
int fw_file_drop(const char *name)   /* (CJI-4: its buffer freed) */
{
	fw_file_t *f = fw_file(name);
	if (!f)
		return -1;
	free(f->buf);
	*f = fw_files[--nfw_files];
	return 0;
}
const char *fw_file_get(const char *name, size_t *len)
{
	fw_file_t *f = fw_file(name);
	if (!f)
		return NULL;
	if (len)
		*len = f->len;
	return f->buf;
}

static FILE *mem_file(char *buf, size_t len, size_t cap, unsigned flags)
{
	FILE *f = calloc(1, sizeof *f);
	if (!f)
		return NULL;
	f->fd = -1;
	f->buf = buf;
	f->len = len;
	f->cap = cap;
	f->flags = F_MEM | flags;
	return f;
}
static size_t file_write(FILE *f, const void *p, size_t n)
{
	if (!(f->flags & F_MEM)) {
		_hc_write(f->fd, p, n);
		return n;
	}
	if (!(f->flags & F_WRITE))
		return 0;
	if (f->pos + n + 1 > f->cap) {
		size_t cap = f->cap ? f->cap : 256;
		char *b;
		while (f->pos + n + 1 > cap)
			cap *= 2;
		if (!(b = realloc(f->buf, cap)))
			return 0;
		f->buf = b;
		f->cap = cap;
	}
	memcpy(f->buf + f->pos, p, n);
	f->pos += n;
	if (f->pos > f->len)
		f->len = f->pos;
	f->buf[f->len] = 0;
	return n;
}
static void stream_sync(FILE *f)
{
	if (f->flags & F_STREAM) {
		if (!f->buf && (f->buf = malloc(1)))   /* (the caller frees it: even an empty stream's is malloc's) */
			f->buf[0] = 0, f->cap = 1;
		*f->sptr = f->buf;
		*f->ssize = f->len;
	}
}
FILE *fmemopen(void *buf, size_t size, const char *mode)
{
	return mode[0] == 'r' ? mem_file(buf, size, size, F_READ) : NULL;
}
FILE *open_memstream(char **ptr, size_t *sizeloc)
{
	FILE *f = mem_file(NULL, 0, 0, F_WRITE | F_STREAM);
	if (f) {
		f->sptr = ptr;
		f->ssize = sizeloc;
		*ptr = NULL;
		*sizeloc = 0;
	}
	return f;
}
FILE *tmpfile(void) { return mem_file(NULL, 0, 0, F_READ | F_WRITE | F_OWN); }
/* "r": a buffer the firmware registered, else the machine's storage; "w": a buffer, registered under the name when
   the file is closed */
FILE *fopen(const char *name, const char *mode)
{
	FILE *f;
	if (mode[0] == 'r') {
		fw_file_t *r = fw_file(name);
		size_t n = 0;
		char *b;
		if (r)
			return mem_file(r->buf, r->len, r->len, F_READ);
		if (!(b = _hc_load(name, &n)))
			return NULL;
		return mem_file(b, n, n, F_READ | F_OWN);
	}
	if (mode[0] != 'w' || !(f = mem_file(NULL, 0, 0, F_WRITE | F_OWN | F_KEEP)))
		return NULL;
	strncpy(f->name, name, sizeof f->name - 1);
	return f;
}
int fclose(FILE *f)
{
	if (!f || !(f->flags & F_MEM))
		return 0;
	stream_sync(f);
	if (f->flags & F_KEEP)
		fw_file_put(f->name, f->buf ? f->buf : "", f->len);
	if ((f->flags & F_OWN) && f->buf)
		free(f->buf);
	free(f);
	return 0;
}
int fflush(FILE *o) { if (o && (o->flags & F_MEM)) stream_sync(o); return 0; }
int fseek(FILE *f, long off, int whence)
{
	long base = whence == 1 ? (long)f->pos : whence == 2 ? (long)f->len : 0;
	if (!(f->flags & F_MEM) || base + off < 0)
		return -1;
	f->pos = (size_t)(base + off);
	return 0;
}
long ftell(FILE *f) { return f->flags & F_MEM ? (long)f->pos : -1; }
void rewind(FILE *f) { fseek(f, 0, 0); }
int fileno(FILE *f) { return f->fd; }
size_t fread(void *p, size_t size, size_t n, FILE *f)
{
	size_t want = size * n, have;
	if (!(f->flags & F_MEM) || !(f->flags & F_READ) || !size)
		return 0;
	have = f->pos < f->len ? f->len - f->pos : 0;
	if (want > have)
		want = have - have % size;
	memcpy(p, f->buf + f->pos, want);
	f->pos += want;
	return want / size;
}
int fgetc(FILE *f)
{
	unsigned char c;
	return fread(&c, 1, 1, f) == 1 ? c : EOF;
}
int getc(FILE *f) { return fgetc(f); }
char *fgets(char *s, int n, FILE *f)
{
	int k = 0;
	if (!(f->flags & F_MEM) || n <= 0 || f->pos >= f->len)
		return NULL;
	while (k < n - 1 && f->pos < f->len) {
		char c = f->buf[f->pos++];
		s[k++] = c;
		if (c == '\n')
			break;
	}
	s[k] = 0;
	return s;
}
int feof(FILE *f) { return (f->flags & F_MEM) && f->pos >= f->len; }
int ferror(FILE *f) { (void)f; return 0; }

int vfprintf(FILE *o, const char *f, va_list ap)
{
	char buf[4096];
	va_list aq;
	int r;
	va_copy(aq, ap);
	r = _hc_vsnprintf(buf, sizeof buf, f, ap);
	if ((size_t)r < sizeof buf)
		file_write(o, buf, (size_t)r);
	else {   /* (longer than the buffer: once more, into one that fits) */
		char *big = malloc((size_t)r + 1);
		if (big) {
			_hc_vsnprintf(big, (size_t)r + 1, f, aq);
			file_write(o, big, (size_t)r);
			free(big);
		}
	}
	va_end(aq);
	return r;
}
int fprintf(FILE *o, const char *f, ...) { va_list ap; int r; va_start(ap, f); r = vfprintf(o, f, ap); va_end(ap); return r; }
int printf(const char *f, ...) { va_list ap; int r; va_start(ap, f); r = vfprintf(stdout, f, ap); va_end(ap); return r; }
int fputs(const char *s, FILE *o) { file_write(o, s, strlen(s)); return 0; }
int puts(const char *s) { fputs(s, stdout); file_write(stdout, "\n", 1); return 0; }
int fputc(int c, FILE *o) { char ch = (char)c; file_write(o, &ch, 1); return c; }
int putc(int c, FILE *o) { return fputc(c, o); }
int putchar(int c) { return fputc(c, stdout); }
size_t fwrite(const void *p, size_t size, size_t n, FILE *o) { return size ? file_write(o, p, size * n) / size : 0; }
void perror(const char *s) { fputs(s ? s : "", stderr); fputs(": no such file\n", stderr); }

char **fw_environ;   /* (a firmware's main may give one: NAME=VALUE strings, NULL-terminated) */
char *getenv(const char *name)
{
	size_t n = strlen(name);
	for (char **e = fw_environ; e && *e; e++)
		if (!strncmp(*e, name, n) && (*e)[n] == '=')
			return *e + n + 1;
	return NULL;
}

