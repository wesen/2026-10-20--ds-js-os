#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"

char *xstrdup(const char *s) { if (!s) return NULL; size_t n = strlen(s) + 1; char *d = malloc(n); memcpy(d, s, n); return d; }

char *read_file(const char *path, size_t *len) {
  FILE *f = fopen(path, "rb");
  if (!f) return NULL;
  fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
  char *b = malloc((size_t)n + 1);
  if (fread(b, 1, (size_t)n, f) != (size_t)n) { fclose(f); free(b); return NULL; }
  b[n] = 0; fclose(f);
  if (len) *len = (size_t)n;
  return b;
}

static void sb_grow(sbuf_t *b, size_t extra) {
  if (b->n + extra + 1 <= b->cap) return;
  size_t c = b->cap ? b->cap : 256;
  while (c < b->n + extra + 1) c *= 2;
  b->s = realloc(b->s, c); b->cap = c;
}
void sb_add(sbuf_t *b, const char *s) { size_t n = strlen(s); sb_grow(b, n); memcpy(b->s + b->n, s, n + 1); b->n += n; }
void sb_printf(sbuf_t *b, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt); int n = vsnprintf(NULL, 0, fmt, ap); va_end(ap);
  sb_grow(b, (size_t)n); va_start(ap, fmt); vsnprintf(b->s + b->n, (size_t)n + 1, fmt, ap); va_end(ap); b->n += (size_t)n;
}
void sb_json_str(sbuf_t *b, const char *s) {
  sb_add(b, "\"");
  for (const unsigned char *p = (const unsigned char *)(s ? s : ""); *p; p++) {
    if (*p == '"' || *p == '\\') { char t[3] = { '\\', (char)*p, 0 }; sb_add(b, t); }
    else if (*p == '\n') sb_add(b, "\\n");
    else if (*p < 0x20) sb_printf(b, "\\u%04x", *p);
    else { char t[2] = { (char)*p, 0 }; sb_add(b, t); }
  }
  sb_add(b, "\"");
}
