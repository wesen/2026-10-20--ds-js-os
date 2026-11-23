// The compiled-module cache's portable core (typed_cache.h): the key, the entry format, the store and the eviction.
#include "typed_cache.h"

#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#define CLUSTER 4096u   // the P4's FAT allocates whole 4 KB sectors

// ---- SHA-256 ----
#ifdef ESP_PLATFORM
void tc_hash_begin(tc_hash *h) {
  mbedtls_sha256_init(&h->c);
  mbedtls_sha256_starts(&h->c, 0);
}
void tc_hash_update(tc_hash *h, const void *bytes, size_t n) { mbedtls_sha256_update(&h->c, bytes, n); }
void tc_hash_end(tc_hash *h, uint8_t out[32]) {
  mbedtls_sha256_finish(&h->c, out);
  mbedtls_sha256_free(&h->c);
}
#else
static const uint32_t K[64] = {
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};
#define ROR(x, n) ((x) >> (n) | (x) << (32 - (n)))
static void compress(uint32_t s[8], const uint8_t b[64]) {
  uint32_t w[64], v[8];
  for (int i = 0; i < 16; i++) w[i] = (uint32_t)b[4 * i] << 24 | b[4 * i + 1] << 16 | b[4 * i + 2] << 8 | b[4 * i + 3];
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = ROR(w[i - 15], 7) ^ ROR(w[i - 15], 18) ^ w[i - 15] >> 3;
    uint32_t s1 = ROR(w[i - 2], 17) ^ ROR(w[i - 2], 19) ^ w[i - 2] >> 10;
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  memcpy(v, s, sizeof v);
  for (int i = 0; i < 64; i++) {
    uint32_t t1 = v[7] + (ROR(v[4], 6) ^ ROR(v[4], 11) ^ ROR(v[4], 25)) + ((v[4] & v[5]) ^ (~v[4] & v[6])) + K[i] + w[i];
    uint32_t t2 = (ROR(v[0], 2) ^ ROR(v[0], 13) ^ ROR(v[0], 22)) + ((v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]));
    memmove(v + 1, v, 7 * sizeof *v);
    v[4] += t1;
    v[0] = t1 + t2;
  }
  for (int i = 0; i < 8; i++) s[i] += v[i];
}
void tc_hash_begin(tc_hash *h) {
  static const uint32_t init[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                   0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
  memcpy(h->state, init, sizeof init);
  h->bytes = 0;
}
void tc_hash_update(tc_hash *h, const void *bytes, size_t n) {
  const uint8_t *p = bytes;
  while (n) {
    size_t at = h->bytes % 64, take = 64 - at < n ? 64 - at : n;
    memcpy(h->block + at, p, take);
    h->bytes += take; p += take; n -= take;
    if (at + take == 64) compress(h->state, h->block);
  }
}
void tc_hash_end(tc_hash *h, uint8_t out[32]) {
  uint64_t bits = h->bytes * 8;
  uint8_t pad = 0x80, zero = 0, len[8];
  tc_hash_update(h, &pad, 1);
  while (h->bytes % 64 != 56) tc_hash_update(h, &zero, 1);
  for (int i = 0; i < 8; i++) len[i] = (uint8_t)(bits >> (56 - 8 * i));
  tc_hash_update(h, len, 8);
  for (int i = 0; i < 32; i++) out[i] = (uint8_t)(h->state[i / 4] >> (24 - 8 * (i % 4)));
}
#endif
void tc_sha256(const void *bytes, size_t n, uint8_t out[32]) {
  tc_hash h;
  tc_hash_begin(&h);
  tc_hash_update(&h, bytes, n);
  tc_hash_end(&h, out);
}

// ---- the key: SHA-256 over "PCTC-key\0", the format, then tagged items (tag, NUL, u32 length, bytes) ----
static void put32(uint8_t *p, uint32_t v) { for (int i = 0; i < 4; i++) p[i] = (uint8_t)(v >> 8 * i); }
static uint32_t get32(const uint8_t *p) { return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }
static void item(tc_hash *h, const char *tag, const void *bytes, size_t n) {
  uint8_t len[4];
  put32(len, (uint32_t)n);
  tc_hash_update(h, tag, strlen(tag) + 1);
  tc_hash_update(h, len, 4);
  tc_hash_update(h, bytes, n);
}
static void text(tc_hash *h, const char *tag, const char *s) { item(h, tag, s, strlen(s)); }

void tc_key(const tc_inputs *in, uint8_t key[32]) {
  tc_hash h;
  uint8_t format[4];
  put32(format, TC_FORMAT);
  tc_hash_begin(&h);
  tc_hash_update(&h, "PCTC-key", 9);
  tc_hash_update(&h, format, 4);
  text(&h, "native", in->native);
  for (size_t i = 0; i < in->n_bundles; i++) {
    text(&h, "bundle", in->bundles[i].path);
    item(&h, "digest", in->bundles[i].digest, 32);
  }
  for (const char *const *m = in->modules; m && *m; m++) text(&h, "module", *m);
  text(&h, "backend", in->backend);
  if (in->backend_digest) item(&h, "backend-digest", in->backend_digest, 32);
  item(&h, "linker", in->linker, 32);
  text(&h, "entry", in->entry);
  item(&h, "reactor", in->reactor, 32);
  item(&h, "source", in->source, 32);
  if (in->policy) text(&h, "policy", in->policy);
  else text(&h, "default-policy", "");
  tc_hash_end(&h, key);
}

void tc_name(const uint8_t key[32], char out[33]) {
  for (int i = 0; i < 16; i++) snprintf(out + 2 * i, 3, "%02x", key[i]);
}

// ---- the header ----
void tc_header_encode(const tc_header *h, uint8_t out[TC_HEADER]) {
  uint8_t check[32];
  memset(out, 0, TC_HEADER);
  memcpy(out, "PCTC", 4);
  put32(out + 4, TC_FORMAT);
  memcpy(out + 8, h->key, 32);
  put32(out + 40, h->length);
  memcpy(out + 44, h->sha, 32);
  put32(out + 76, h->seq);
  put32(out + 80, h->compile_us);
  memcpy(out + 84, h->app, strnlen(h->app, 31));
  memcpy(out + 116, h->label, strnlen(h->label, 39));
  tc_sha256(out, 156, check);
  memcpy(out + 156, check, 4);
}

bool tc_header_decode(const uint8_t in[TC_HEADER], tc_header *h, const char **why) {
  uint8_t check[32];
  tc_sha256(in, 156, check);
  *why = memcmp(in, "PCTC", 4) ? "not an entry" : get32(in + 4) != TC_FORMAT ? "another format"
       : memcmp(in + 156, check, 4) ? "header check" : get32(in + 40) > TC_MAX_MODULE ? "module too large"
       : in[115] || in[155] ? "unterminated name" : NULL;
  if (*why) return false;
  memcpy(h->key, in + 8, 32);
  h->length = get32(in + 40);
  memcpy(h->sha, in + 44, 32);
  h->seq = get32(in + 76);
  h->compile_us = get32(in + 80);
  memcpy(h->app, in + 84, 32);
  memcpy(h->label, in + 116, 40);
  return true;
}

// ---- files ----
static bool path_of(char *out, size_t n, const char *dir, const uint8_t key[32], const char *suffix) {
  char name[33];
  tc_name(key, name);
  int k = snprintf(out, n, "%s/%s%s", dir, name, suffix);
  return k > 0 && (size_t)k < n;
}

static void say(char *why, size_t n, const char *fmt, const char *a, long b) { if (why && n) snprintf(why, n, fmt, a, b); }

// The header of the open file f, checked against its size; NULL when it is valid.
static const char *read_header(FILE *f, tc_header *h, long *size) {
  uint8_t raw[TC_HEADER];
  const char *why = NULL;
  if (fseek(f, 0, SEEK_END) || (*size = ftell(f)) < 0 || fseek(f, 0, SEEK_SET)) return "unreadable";
  if (fread(raw, 1, TC_HEADER, f) != TC_HEADER) return "short header";
  if (!tc_header_decode(raw, h, &why)) return why;
  return *size == (long)TC_HEADER + (long)h->length ? NULL : "torn module";
}

tc_result tc_read(const char *dir, const uint8_t key[32], char **module, tc_header *h, char *why, size_t why_n) {
  char path[160];
  *module = NULL;
  if (!path_of(path, sizeof path, dir, key, ".cache")) return TC_MISS;
  FILE *f = fopen(path, "rb");
  if (!f) return TC_MISS;
  long size = 0;
  const char *bad = read_header(f, h, &size);
  if (!bad && memcmp(h->key, key, 32)) bad = "another key";
  char *bytes = NULL;
  if (!bad) {
    bytes = malloc((size_t)h->length + 1);
    if (!bytes) {
      fclose(f);
      return TC_NO_MEMORY;
    }
    uint8_t sha[32];
    if (fread(bytes, 1, h->length, f) != h->length) bad = "short module";
    else if (tc_sha256(bytes, h->length, sha), memcmp(sha, h->sha, 32)) bad = "module checksum";
  }
  fclose(f);
  if (bad) {
    free(bytes);
    remove(path);
    say(why, why_n, "%s (%ld bytes); deleted", bad, size);
    return TC_CORRUPT;
  }
  bytes[h->length] = 0;
  *module = bytes;
  return TC_HIT;
}

bool tc_exists(const char *dir, const uint8_t key[32]) {
  char path[160];
  tc_header h;
  long size;
  FILE *f = path_of(path, sizeof path, dir, key, ".cache") ? fopen(path, "rb") : NULL;
  bool ok = f && !read_header(f, &h, &size) && !memcmp(h.key, key, 32);
  if (f) fclose(f);
  return ok;
}

static bool ends_with(const char *s, const char *suffix) {
  size_t n = strlen(s), k = strlen(suffix);
  return n >= k && !strcmp(s + n - k, suffix);
}

int tc_list(const char *dir, tc_each each, void *arg) {
  DIR *d = opendir(dir);
  if (!d) return 0;
  int n = 0;
  struct dirent *e;
  while ((e = readdir(d))) {
    char path[160];
    if (!ends_with(e->d_name, ".cache") || snprintf(path, sizeof path, "%s/%s", dir, e->d_name) >= (int)sizeof path) continue;
    FILE *f = fopen(path, "rb");
    tc_header h;
    long size = -1;
    bool valid = f && !read_header(f, &h, &size);
    if (f) fclose(f);
    if (!valid) memset(&h, 0, sizeof h);
    n++;
    if (!each(arg, e->d_name, &h, valid, size)) break;
  }
  closedir(d);
  return n;
}

typedef struct { char file[48], app[32], label[40]; uint32_t seq; uint64_t bytes; bool valid, same; } entry;
typedef struct { entry *e; size_t n, cap; const char *same; } scan;

static bool collect(void *arg, const char *file, const tc_header *h, bool valid, long size) {
  scan *s = arg;
  if (s->n == s->cap) {
    entry *more = realloc(s->e, (s->cap ? 2 * s->cap : 16) * sizeof *more);
    if (!more) return false;
    s->e = more;
    s->cap = s->cap ? 2 * s->cap : 16;
  }
  entry *x = &s->e[s->n++];
  memset(x, 0, sizeof *x);
  snprintf(x->file, sizeof x->file, "%s", file);
  memcpy(x->app, h->app, sizeof x->app);
  memcpy(x->label, h->label, sizeof x->label);
  x->seq = h->seq;
  x->bytes = size < 0 ? 0 : ((uint64_t)size + CLUSTER - 1) / CLUSTER * CLUSTER;
  x->valid = valid;
  x->same = !strcmp(file, s->same);
  return true;
}

static void drop(const char *dir, entry *x) {
  char path[160];
  snprintf(path, sizeof path, "%s/%s", dir, x->file);
  remove(path);
  x->valid = false;
  x->bytes = 0;
}

// The oldest valid entry other than the one being replaced (optionally only those of app and label), or NULL.
static entry *oldest(scan *s, const char *app, const char *label) {
  entry *best = NULL;
  for (size_t i = 0; i < s->n; i++) {
    entry *x = &s->e[i];
    if (x->valid && !x->same && (!app || (!strcmp(x->app, app) && !strcmp(x->label, label))) && (!best || x->seq < best->seq))
      best = x;
  }
  return best;
}

static void make_dirs(const char *dir) {
  char p[160];
  snprintf(p, sizeof p, "%s", dir);
  for (char *c = p + 1; *c; c++)
    if (*c == '/') { *c = 0; mkdir(p, 0775); *c = '/'; }
  mkdir(p, 0775);
}

static void remove_torn(const char *dir) {
  DIR *d = opendir(dir);
  if (!d) return;
  char found[8][48];
  int n = 0;
  struct dirent *e;
  while ((e = readdir(d)) && n < 8)
    if (ends_with(e->d_name, ".tmp") && strlen(e->d_name) < sizeof *found) memcpy(found[n++], e->d_name, strlen(e->d_name) + 1);
  closedir(d);
  for (int i = 0; i < n; i++) {
    char path[160];
    snprintf(path, sizeof path, "%s/%s", dir, found[i]);
    remove(path);
  }
}

bool tc_prepare(const char *dir, tc_header *h, uint64_t free_bytes, const tc_policy *p, char *why, size_t why_n) {
  char same[48];
  tc_name(h->key, same);
  strcat(same, ".cache");
  make_dirs(dir);
  remove_torn(dir);
  scan s = {.same = same};
  tc_list(dir, collect, &s);
  uint32_t seq = 0;
  uint64_t total = 0, freed = 0, need = ((uint64_t)TC_HEADER + h->length + CLUSTER - 1) / CLUSTER * CLUSTER;
  for (size_t i = 0; i < s.n; i++) {
    entry *x = &s.e[i];
    if (!x->valid) {   // not an entry of this format, or torn: it can never hit
      freed += x->bytes;
      drop(dir, x);
      continue;
    }
    if (x->seq > seq) seq = x->seq;
  }
  h->seq = seq + 1;
  // Refused before anything valid is deleted when even an empty cache could not hold it.
  uint64_t evictable = 0;
  for (size_t i = 0; i < s.n; i++)
    if (s.e[i].valid && !s.e[i].same) evictable += s.e[i].bytes;
  if (need > p->budget || free_bytes + freed + evictable < need + p->reserve) {
    free(s.e);
    say(why, why_n, "no room for %s (%ld bytes)", h->app, (long)need);
    return false;
  }
  // per_label - 1 of the same app and label stay beside the new one
  unsigned kept = 0;
  for (size_t i = 0; i < s.n; i++)
    if (s.e[i].valid && !s.e[i].same && !strcmp(s.e[i].app, h->app) && !strcmp(s.e[i].label, h->label)) kept++;
  for (entry *x; kept + 1 > p->per_label && (x = oldest(&s, h->app, h->label)); kept--) {
    freed += x->bytes;
    drop(dir, x);
  }
  for (size_t i = 0; i < s.n; i++)
    if (s.e[i].valid && !s.e[i].same) total += s.e[i].bytes;
  for (entry *x; (total + need > p->budget || free_bytes + freed < need + p->reserve) && (x = oldest(&s, NULL, NULL));) {
    total -= x->bytes;
    freed += x->bytes;
    drop(dir, x);
  }
  free(s.e);
  if (total + need > p->budget || free_bytes + freed < need + p->reserve) {
    say(why, why_n, "no room for %s (%ld bytes)", h->app, (long)need);
    return false;
  }
  return true;
}

// Written in TC_CHUNK pieces that end on 4 KB boundaries of the file (the first holds the header), unbuffered, so
// each fwrite is one sector's flash work; pace, when given, is asked before each piece and before the close.
bool tc_write_tmp(const char *dir, const tc_header *h, const char *module, tc_pace pace, void *arg, char *why,
                  size_t why_n) {
  char path[160];
  uint8_t *first = NULL;
  if (!path_of(path, sizeof path, dir, h->key, ".tmp") || !(first = malloc(TC_CHUNK))) return false;
  tc_header_encode(h, first);
  const size_t head = h->length < TC_CHUNK - TC_HEADER ? h->length : TC_CHUNK - TC_HEADER;
  memcpy(first + TC_HEADER, module, head);
  FILE *f = (!pace || pace(arg)) ? fopen(path, "wb") : NULL;
  if (!f) {
    free(first);
    say(why, why_n, "cannot create %s (errno %ld)", path, errno);
    return false;
  }
  setvbuf(f, NULL, _IONBF, 0);
  bool ok = (!pace || pace(arg)) && fwrite(first, 1, TC_HEADER + head, f) == TC_HEADER + head;   // the open was one piece
  free(first);
  for (size_t at = head; ok && at < h->length; at += TC_CHUNK) {
    const size_t n = h->length - at < TC_CHUNK ? h->length - at : TC_CHUNK;
    ok = (!pace || pace(arg)) && fwrite(module + at, 1, n, f) == n;
  }
  ok = (!pace || pace(arg)) && ok;
  ok = !fclose(f) && ok;
  if (!ok) {
    remove(path);
    say(why, why_n, "short write to %s (errno %ld)", path, errno);
  }
  return ok;
}

bool tc_commit(const char *dir, const uint8_t key[32], char *why, size_t why_n) {
  char tmp[160], final[160];
  if (!path_of(tmp, sizeof tmp, dir, key, ".tmp") || !path_of(final, sizeof final, dir, key, ".cache")) return false;
  remove(final);   // FAT does not rename over an existing file
  if (rename(tmp, final)) {
    say(why, why_n, "cannot rename %s (errno %ld)", tmp, errno);
    remove(tmp);
    return false;
  }
  return true;
}

// Collected first and removed after: removing names while a directory is being read may skip some.
int tc_clear(const char *dir) {
  scan s = {.same = ""};
  tc_list(dir, collect, &s);
  for (size_t i = 0; i < s.n; i++) drop(dir, &s.e[i]);
  free(s.e);
  return (int)s.n;
}
