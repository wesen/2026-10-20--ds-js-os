// A command-line driver of the compiled-module cache's portable core (firmware/port/esp32p4/main/typed_cache.c) for
// tests/native/test_typed_cache.py. Built by firmware/Makefile (test-typed-cache).
//
//   sha256 FILE
//   key native=S bundle=PATH:FILE... module=NAME... backend=PATH [backend-file=FILE] linker=FILE entry=S
//       reactor=FILE source=FILE [policy=S]                               -> the key in hex, then its file name
//   store DIR KEY APP LABEL MODULE FREE PER_LABEL BUDGET RESERVE        -> "stored SEQ" or "refused WHY"
//   tmp DIR KEY APP LABEL MODULE                                        -> writes only the .tmp (a store cut short)
//   read DIR KEY OUT                                                    -> "hit SEQ APP LABEL BYTES", "miss", "corrupt WHY"
//   list DIR                                                            -> "FILE valid|invalid SEQ APP LABEL SIZE" lines
//   clear DIR                                                           -> how many entries it removed
#include "typed_cache.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *slurp(const char *path, size_t *n) {
  FILE *f = fopen(path, "rb");
  if (!f) { fprintf(stderr, "cannot read %s\n", path); exit(2); }
  fseek(f, 0, SEEK_END);
  long size = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *b = malloc((size_t)size + 1);
  if (!b || fread(b, 1, (size_t)size, f) != (size_t)size) { fprintf(stderr, "cannot read %s\n", path); exit(2); }
  fclose(f);
  *n = (size_t)size;
  return b;
}

static uint8_t *digest_of(const char *path) {
  size_t n;
  char *b = slurp(path, &n);
  uint8_t *d = malloc(32);
  tc_sha256(b, n, d);
  free(b);
  return d;
}

static void hex(const uint8_t *b, size_t n) { for (size_t i = 0; i < n; i++) printf("%02x", b[i]); }

static void parse_key(const char *s, uint8_t key[32]) {
  if (strlen(s) != 64) { fprintf(stderr, "a key is 64 hex digits\n"); exit(2); }
  for (int i = 0; i < 32; i++) { unsigned v; sscanf(s + 2 * i, "%2x", &v); key[i] = (uint8_t)v; }
}

static int key(int argc, char **argv) {
  tc_inputs in = {0};
  tc_bundle bundles[32];
  const char *modules[16] = {0};
  size_t n_modules = 0;
  in.bundles = bundles;
  in.modules = modules;
  for (int i = 0; i < argc; i++) {
    char *eq = strchr(argv[i], '=');
    if (!eq) return 2;
    *eq = 0;
    const char *k = argv[i], *v = eq + 1;
    if (!strcmp(k, "native")) in.native = v;
    else if (!strcmp(k, "bundle")) {
      char *colon = strchr(eq + 1, ':');
      if (!colon || in.n_bundles == 32) return 2;
      *colon = 0;
      bundles[in.n_bundles++] = (tc_bundle){v, digest_of(colon + 1)};
    } else if (!strcmp(k, "module") && n_modules < 15) modules[n_modules++] = v;
    else if (!strcmp(k, "backend")) in.backend = v;
    else if (!strcmp(k, "backend-file")) in.backend_digest = digest_of(v);
    else if (!strcmp(k, "linker")) in.linker = digest_of(v);
    else if (!strcmp(k, "entry")) in.entry = v;
    else if (!strcmp(k, "reactor")) in.reactor = digest_of(v);
    else if (!strcmp(k, "source")) in.source = digest_of(v);
    else if (!strcmp(k, "policy")) in.policy = v;
    else return 2;
  }
  if (!in.native || !in.backend || !in.linker || !in.entry || !in.reactor || !in.source) return 2;
  uint8_t k[32];
  char name[33];
  tc_key(&in, k);
  tc_name(k, name);
  hex(k, 32);
  printf(" %s\n", name);
  return 0;
}

static void header_for(tc_header *h, const char *key_hex, const char *app, const char *label, const char *module, size_t n) {
  memset(h, 0, sizeof *h);
  parse_key(key_hex, h->key);
  snprintf(h->app, sizeof h->app, "%s", app);
  snprintf(h->label, sizeof h->label, "%s", label);
  h->length = (uint32_t)n;
  h->compile_us = 1234567;
  tc_sha256(module, n, h->sha);
}

// Counts the pieces of a write (each is one sector's flash work on the P4).
static unsigned chunks;
static bool paced(void *arg) { (*(unsigned *)arg)++; return true; }

static bool show(void *arg, const char *file, const tc_header *h, bool valid, long size) {
  printf("%s %s %u %s %s %ld\n", file, valid ? "valid" : "invalid", (unsigned)h->seq, valid ? h->app : "-",
         valid ? h->label : "-", size);
  return true;
}

int main(int argc, char **argv) {
  if (argc < 2) return 2;
  const char *cmd = argv[1];
  char why[200] = "";
  if (!strcmp(cmd, "sha256") && argc == 3) {
    uint8_t *d = digest_of(argv[2]);
    hex(d, 32);
    printf("\n");
    return 0;
  }
  if (!strcmp(cmd, "key")) return key(argc - 2, argv + 2);
  if ((!strcmp(cmd, "store") && argc == 11) || (!strcmp(cmd, "tmp") && argc == 7)) {
    size_t n;
    char *module = slurp(argv[6], &n);
    tc_header h;
    header_for(&h, argv[3], argv[4], argv[5], module, n);
    if (!strcmp(cmd, "tmp")) {
      h.seq = 999;
      return tc_write_tmp(argv[2], &h, module, paced, &chunks, why, sizeof why) ? 0 : 1;
    }
    tc_policy p = {(unsigned)atoi(argv[8]), strtoull(argv[9], NULL, 10), strtoull(argv[10], NULL, 10)};
    bool ok = tc_prepare(argv[2], &h, strtoull(argv[7], NULL, 10), &p, why, sizeof why) &&
              tc_write_tmp(argv[2], &h, module, paced, &chunks, why, sizeof why) && tc_commit(argv[2], h.key, why, sizeof why);
    if (!ok) printf("refused %s\n", why);
    else if (getenv("TC_CHUNKS")) printf("stored %u chunks %u\n", (unsigned)h.seq, chunks);
    else printf("stored %u\n", (unsigned)h.seq);
    return 0;
  }
  if (!strcmp(cmd, "read") && argc == 5) {
    uint8_t k[32];
    parse_key(argv[3], k);
    char *module = NULL;
    tc_header h;
    tc_result r = tc_read(argv[2], k, &module, &h, why, sizeof why);
    if (r == TC_HIT) {
      FILE *f = fopen(argv[4], "wb");
      fwrite(module, 1, h.length, f);
      fclose(f);
      printf("hit %u %s %s %u\n", (unsigned)h.seq, h.app, h.label, (unsigned)h.length);
    } else printf(r == TC_MISS ? "miss\n" : r == TC_CORRUPT ? "corrupt %s\n" : "no-memory\n", why);
    free(module);
    return 0;
  }
  if (!strcmp(cmd, "list") && argc == 3) { tc_list(argv[2], show, NULL); return 0; }
  if (!strcmp(cmd, "clear") && argc == 3) { printf("%d\n", tc_clear(argv[2])); return 0; }
  return 2;
}
