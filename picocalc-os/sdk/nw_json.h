// Small JSON helpers for native worlds. They allocate nothing and use no C library, so a module built for WebAssembly
// without one can use them as a host process does. They read what the kernel delivers: payloads made by JSON.stringify
// ({"a":1,"b":"x"}), results such as [11,82], and keys without escapes.
//
//   nw_json_find(json, "key")          the value of a key of the top-level object, or 0
//   nw_json_num(json, "key", &d)       a number                       1 if found, 0 if not
//   nw_json_str(json, "key", buf, n)   a string, unescaped (\uXXXX above ASCII becomes '?'); its length, or -1
//   nw_json_bytes(json, out, n)        an array of integers 0..255, such as an i2c read; how many, or -1
//   nw_json_quote(dst, n, s)           s as a JSON string literal, quotes included; its length, or -1 if it does not fit
#pragma once

static inline const char *nw_json__ws(const char *p) {
  while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
  return p;
}

// The position after the value at p, or 0 if it is malformed.
static inline const char *nw_json__skip(const char *p, int depth) {
  p = nw_json__ws(p);
  if (depth > 64) return 0;
  if (*p == '"') {
    for (p++; *p && *p != '"'; p++) if (*p == '\\' && !*++p) return 0;
    return *p ? p + 1 : 0;
  }
  if (*p == '{' || *p == '[') {
    char close = *p == '{' ? '}' : ']';
    p = nw_json__ws(p + 1);
    if (*p == close) return p + 1;
    for (;;) {
      if (close == '}') {
        if (!(p = nw_json__skip(p, depth + 1))) return 0;
        p = nw_json__ws(p);
        if (*p++ != ':') return 0;
      }
      if (!(p = nw_json__skip(p, depth + 1))) return 0;
      p = nw_json__ws(p);
      if (*p == close) return p + 1;
      if (*p++ != ',') return 0;
    }
  }
  const char *s = p;
  while (*p && *p != ',' && *p != '}' && *p != ']' && *p != ' ' && *p != '\n' && *p != '\r' && *p != '\t') p++;
  return p > s ? p : 0;
}

static inline const char *nw_json_find(const char *json, const char *key) {
  if (!json) return 0;
  const char *p = nw_json__ws(json);
  if (*p != '{') return 0;
  p = nw_json__ws(p + 1);
  while (*p == '"') {
    const char *k = p + 1, *q = key;
    while (*q && *k == *q) k++, q++;
    int hit = !*q && *k == '"';
    if (!(p = nw_json__skip(p, 0))) return 0;
    p = nw_json__ws(p);
    if (*p++ != ':') return 0;
    p = nw_json__ws(p);
    if (hit) return p;
    if (!(p = nw_json__skip(p, 0))) return 0;
    p = nw_json__ws(p);
    if (*p != ',') return 0;
    p = nw_json__ws(p + 1);
  }
  return 0;
}

static inline const char *nw_json__number(const char *p, double *out) {
  double v = 0, scale = 1;
  int neg = *p == '-', any = 0;
  if (neg) p++;
  for (; *p >= '0' && *p <= '9'; p++, any = 1) v = v * 10 + (*p - '0');
  if (*p == '.') for (p++; *p >= '0' && *p <= '9'; p++, any = 1) v += (*p - '0') * (scale /= 10);
  if (!any) return 0;
  if (*p == 'e' || *p == 'E') {
    int eneg = *++p == '-', e = 0;
    if (*p == '-' || *p == '+') p++;
    for (; *p >= '0' && *p <= '9'; p++) e = e < 400 ? e * 10 + (*p - '0') : e;
    while (e-- > 0) v = eneg ? v / 10 : v * 10;
  }
  *out = neg ? -v : v;
  return p;
}

static inline int nw_json_num(const char *json, const char *key, double *out) {
  const char *p = nw_json_find(json, key);
  return p && nw_json__number(p, out) ? 1 : 0;
}

static inline int nw_json_str(const char *json, const char *key, char *buf, int n) {
  const char *p = nw_json_find(json, key);
  if (!p || *p != '"' || n <= 0) return -1;
  int k = 0;
  for (p++; *p && *p != '"'; p++) {
    char c = *p;
    if (c == '\\') {
      c = *++p;
      if (c == 'n') c = '\n'; else if (c == 't') c = '\t'; else if (c == 'r') c = '\r';
      else if (c == 'b') c = '\b'; else if (c == 'f') c = '\f';
      else if (c == 'u') {
        int v = 0;
        for (int i = 0; i < 4; i++) {
          char h = *++p;
          if (!h) return -1;
          v = v * 16 + (h >= '0' && h <= '9' ? h - '0' : (h | 0x20) - 'a' + 10);
        }
        c = v > 0 && v < 0x80 ? (char)v : '?';
      } else if (!c) return -1;
    }
    if (k < n - 1) buf[k++] = c;
  }
  buf[k] = 0;
  return *p == '"' ? k : -1;
}

static inline int nw_json_bytes(const char *json, unsigned char *out, int n) {
  const char *p = json ? nw_json__ws(json) : 0;
  if (!p || *p != '[') return -1;
  p = nw_json__ws(p + 1);
  int k = 0;
  if (*p == ']') return 0;
  for (;;) {
    double v;
    if (!(p = nw_json__number(p, &v)) || v < 0 || v > 255 || v != (double)(int)v) return -1;
    if (k < n) out[k] = (unsigned char)v;
    k++;
    p = nw_json__ws(p);
    if (*p == ']') return k < n ? k : n;
    if (*p++ != ',') return -1;
    p = nw_json__ws(p);
  }
}

static inline int nw_json_quote(char *dst, int n, const char *s) {
  static const char hex[] = "0123456789abcdef";
  int k = 0;
#define NW_JSON__PUT(c) do { if (k >= n - 1) return -1; dst[k++] = (c); } while (0)
  NW_JSON__PUT('"');
  for (; *s; s++) {
    unsigned char c = (unsigned char)*s;
    if (c == '"' || c == '\\') { NW_JSON__PUT('\\'); NW_JSON__PUT((char)c); }
    else if (c < 0x20) { NW_JSON__PUT('\\'); NW_JSON__PUT('u'); NW_JSON__PUT('0'); NW_JSON__PUT('0'); NW_JSON__PUT(hex[c >> 4]); NW_JSON__PUT(hex[c & 15]); }
    else NW_JSON__PUT((char)c);
  }
  NW_JSON__PUT('"');
#undef NW_JSON__PUT
  dst[k] = 0;
  return k;
}
