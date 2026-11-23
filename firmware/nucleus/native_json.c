// Payloads: strict JSON (with capability markers for bundled CJI modules) and user-visible text, checked before
// they reach another world or the screen (native worlds; native.c has the system calls).
#include <limits.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "native_internal.h"

// ---- payloads ----------------------------------------------------------------------------------------------------
// A JavaScript world sends what JSON.stringify made; a binary sends any bytes. A payload must therefore be strict JSON
// (RFC 8259, UTF-8, nested at most 64 deep) before it reaches another world, or the receiver's JSON.parse would throw
// inside its turn and crash it. Bundled CJI payloads can name handles. The
// public file-ask operation generates its own marker after checking the sender.
typedef struct { const unsigned char *p, *e; int depth; grants_t *grants; } jp_t;
static void jws(jp_t *j) { while (j->p < j->e && (*j->p == ' ' || *j->p == '\t' || *j->p == '\n' || *j->p == '\r')) j->p++; }
static bool jlit(jp_t *j, const char *w) {
  size_t n = strlen(w);
  if ((size_t)(j->e - j->p) < n || memcmp(j->p, w, n)) return false;
  j->p += n;
  return true;
}
static int utf8_len(const unsigned char *p, const unsigned char *e) {   // a valid sequence's length at p; 0 if invalid
  unsigned c = p[0];
  int n = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC2 ? 2 : 0;
  if (!n || c > 0xF4 || e - p < n) return 0;
  unsigned v = c & (0x7Fu >> n);
  for (int i = 1; i < n; i++) { if ((p[i] & 0xC0) != 0x80) return 0; v = v << 6 | (p[i] & 0x3F); }
  if ((n == 3 && v < 0x800) || (n == 4 && (v < 0x10000 || v > 0x10FFFF)) || (v >= 0xD800 && v <= 0xDFFF)) return 0;
  return n;
}
// A string; its first key_n - 1 characters, decoded, go to key (non-ASCII characters as 0x80)
static bool jstr(jp_t *j, char *key, size_t key_n) {
  size_t k = 0;
  if (j->p >= j->e || *j->p != '"') return false;
  j->p++;
  while (j->p < j->e) {
    unsigned c = *j->p, ch;
    if (c == '"') { j->p++; if (key) key[k < key_n - 1 ? k : key_n - 1] = 0; return true; }
    if (c < 0x20) return false;
    if (c == '\\') {
      if (j->e - j->p < 2) return false;
      unsigned char x = j->p[1];
      j->p += 2;
      if (x == 'u') {
        if (j->e - j->p < 4) return false;
        ch = 0;
        for (int i = 0; i < 4; i++) {
          unsigned char h = j->p[i];
          if (h >= '0' && h <= '9') ch = ch * 16 + (h - '0');
          else if ((h | 0x20) >= 'a' && (h | 0x20) <= 'f') ch = ch * 16 + ((h | 0x20) - 'a' + 10);
          else return false;
        }
        j->p += 4;
      } else if (strchr("\"\\/bfnrt", x) && x) ch = x == 'b' ? 8 : x == 'f' ? 12 : x == 'n' ? 10 : x == 'r' ? 13 : x == 't' ? 9 : x;
      else return false;
    } else if (c < 0x80) { ch = c; j->p++; }
    else { int n = utf8_len(j->p, j->e); if (!n) return false; j->p += n; ch = 0x80; }
    if (key && k < key_n - 1) key[k] = (char)(ch && ch < 0x80 ? ch : 0x80);
    k++;
  }
  return false;
}
static bool jdigits(jp_t *j) { const unsigned char *s = j->p; while (j->p < j->e && *j->p >= '0' && *j->p <= '9') j->p++; return j->p > s; }
static bool jnum(jp_t *j) {
  if (j->p < j->e && *j->p == '-') j->p++;
  if (j->p < j->e && *j->p == '0') j->p++;
  else if (!jdigits(j)) return false;
  if (j->p < j->e && *j->p == '.') { j->p++; if (!jdigits(j)) return false; }
  if (j->p < j->e && (*j->p == 'e' || *j->p == 'E')) {
    j->p++;
    if (j->p < j->e && (*j->p == '+' || *j->p == '-')) j->p++;
    if (!jdigits(j)) return false;
  }
  return true;
}
// A marker occupies an entire object. Its decimal ID must fit the kernel's positive int.
static bool jhandle(jp_t *j) {
  jws(j);
  if (!j->grants || j->p == j->e || *j->p < '1' || *j->p > '9') return false;
  int id = 0;
  while (j->p < j->e && *j->p >= '0' && *j->p <= '9') {
    int digit = *j->p++ - '0';
    if (id > (INT_MAX - digit) / 10) return false;
    id = id * 10 + digit;
  }
  jws(j);
  if (j->p == j->e || *j->p++ != '}') return false;
  for (int i = 0; i < j->grants->count; i++) if (j->grants->ids[i] == id) return true;
  if (j->grants->count == MAX_MSG_HANDLES) return false;
  j->grants->ids[j->grants->count++] = id;
  return true;
}
static bool jvalue(jp_t *j) {
  jws(j);
  if (j->p >= j->e) return false;
  unsigned char c = *j->p;
  if (c == '{' || c == '[') {
    unsigned char close = c == '{' ? '}' : ']';
    if (++j->depth > 64) return false;
    j->p++; jws(j);
    if (j->p < j->e && *j->p == close) { j->p++; j->depth--; return true; }
    bool first = true;
    for (;;) {
      if (c == '{') {
        char key[4];
        jws(j);
        if (!jstr(j, key, sizeof key)) return false;
        jws(j);
        if (j->p >= j->e || *j->p++ != ':') return false;
        if (!strcmp(key, "$h")) { j->depth--; return first && jhandle(j); }
        first = false;
      }
      if (!jvalue(j)) return false;
      jws(j);
      if (j->p >= j->e) return false;
      unsigned char d = *j->p++;
      if (d == close) { j->depth--; return true; }
      if (d != ',') return false;
    }
  }
  if (c == '"') return jstr(j, NULL, 0);
  if (c == 't') return jlit(j, "true");
  if (c == 'f') return jlit(j, "false");
  if (c == 'n') return jlit(j, "null");
  return jnum(j);
}
bool nat_json_ok(const char *s, size_t n, grants_t *grants) {
  jp_t j = { (const unsigned char *)s, (const unsigned char *)s + n, 0, grants };
  if (!jvalue(&j)) return false;
  jws(&j);
  return j.p == j.e;
}
// A call's string i, if present, must be such a payload.
bool payload_ok(const nw_call_t *c, int i) { return c->n[i] == 0 || nat_json_ok(c->s[i], c->n[i], NULL); }
// Text shown to the user (a title, a description, hints): at most max bytes of UTF-8, no control characters.
bool text_ok(const nw_call_t *c, int i, size_t max) {
  const unsigned char *p = (const unsigned char *)c->s[i], *e = p + c->n[i];
  if (c->n[i] > max) return false;
  while (p < e) {
    if (*p < 0x20 || *p == 0x7f) return false;
    if (*p < 0x80) { p++; continue; }
    int k = utf8_len(p, e);
    if (!k) return false;
    p += k;
  }
  return true;
}

