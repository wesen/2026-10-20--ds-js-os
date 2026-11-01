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

// Well-formed UTF-8: the agent's responses and text files are checked before they become JS strings, so the engine
// never silently replaces bytes.
bool utf8_valid(const unsigned char *s, size_t n) {
  for (size_t i = 0; i < n; ) {
    unsigned a = s[i++];
    if (a < 0x80) continue;
    unsigned need, low = 0x80, high = 0xbf;
    if (a >= 0xc2 && a <= 0xdf) need = 1;
    else if (a >= 0xe0 && a <= 0xef) { need = 2; if (a == 0xe0) low = 0xa0; if (a == 0xed) high = 0x9f; }
    else if (a >= 0xf0 && a <= 0xf4) { need = 3; if (a == 0xf0) low = 0x90; if (a == 0xf4) high = 0x8f; }
    else return false;
    if (n - i < need || s[i] < low || s[i] > high) return false;
    i++;
    while (--need) { if (s[i] < 0x80 || s[i] > 0xbf) return false; i++; }
  }
  return true;
}

// Settings' inputs, checked the same way in the kernel op and in the port.
bool net_ssid_ok(const char *s) {   // 1 to 32 bytes, no control characters
  size_t n = s ? strlen(s) : 0;
  if (!n || n > 32 || !utf8_valid((const unsigned char *)s, n)) return false;
  for (const unsigned char *p = (const unsigned char *)s; *p; p++) if (*p < 32 || *p == 127) return false;
  return true;
}
bool net_password_ok(const char *s) {   // none (an open network), 8 to 63 printable ASCII, or 64 hex digits (a PSK)
  size_t n = s ? strlen(s) : 0;
  if (!n) return true;
  if (n < 8 || n > 64) return false;
  for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
    if (*p < 32 || *p > 126) return false;
    if (n == 64 && !((*p >= '0' && *p <= '9') || (*p >= 'a' && *p <= 'f') || (*p >= 'A' && *p <= 'F'))) return false;
  }
  return true;
}
bool tz_valid(const char *s) {   // a POSIX TZ string: a name or <+05>, an offset, maybe rules; printable, no spaces
  size_t n = s ? strlen(s) : 0;
  if (!n || n > 63 || (!((s[0] >= 'A' && s[0] <= 'Z') || (s[0] >= 'a' && s[0] <= 'z')) && s[0] != '<')) return false;
  for (const unsigned char *p = (const unsigned char *)s; *p; p++) if (*p <= 32 || *p >= 127) return false;
  return true;
}
// Clears a secret before its memory is freed; the volatile writes cannot be dropped as dead stores.
void secret_wipe(void *p, size_t n) { volatile unsigned char *q = p; while (n--) *q++ = 0; }
