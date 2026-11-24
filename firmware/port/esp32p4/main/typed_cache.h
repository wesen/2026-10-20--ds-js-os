// The compiled-module cache (PICOCALC-COMPILE-CACHE): a Typed app's module, stored on the FAT partition under a key
// that covers every input of its compile, so a boot compiles only what changed. This is the portable core: the key,
// the file format, the atomic store and the eviction. It runs on the host (tests/native/test_typed_cache.py) and on
// the P4, where typed_cache_p4.c adds the bundle digests, the tasks that do the I/O, and the console.
//
// An entry is one file DIR/<first 32 hex digits of the key>.cache: a TC_HEADER-byte header, then the module.
//   0 "PCTC"  4 format  8 key[32]  40 module length  44 module SHA-256[32]  76 sequence  80 compile us
//   84 app[32]  116 label[40]  156 the first four bytes of the SHA-256 of bytes 0..155 (all integers little-endian)
// A store writes <name>.tmp, closes it, removes <name>.cache and renames, so a reader sees an entry whole or not at
// all; a torn .tmp is removed by the next store. A read checks the header, the full key and the module's SHA-256;
// anything else is a corrupt entry, which the read deletes and reports as a miss.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define TC_FORMAT 1
#define TC_HEADER 160
#define TC_MAX_MODULE (16u << 20)

#ifdef ESP_PLATFORM
#include "mbedtls/sha256.h"   // ESP-IDF's, with the P4's SHA accelerator
typedef struct { mbedtls_sha256_context c; } tc_hash;
#else
typedef struct { uint32_t state[8]; uint64_t bytes; uint8_t block[64]; } tc_hash;
#endif
void tc_hash_begin(tc_hash *h);
void tc_hash_update(tc_hash *h, const void *bytes, size_t n);
void tc_hash_end(tc_hash *h, uint8_t out[32]);
void tc_sha256(const void *bytes, size_t n, uint8_t out[32]);

// What a compile's module depends on. Digests are SHA-256 of the bytes; names are NUL-terminated.
typedef struct { const char *path; const uint8_t *digest; } tc_bundle;
typedef struct {
  const char *native;              // the firmware's compiler code: typed_lex_index's source digest, QuickJS's version
  const tc_bundle *bundles;        // every bundle under typed/, in path order (any of them can be evaluated)
  size_t n_bundles;
  const char *const *modules;      // the app's compiler modules in evaluation order (NULL-terminated, or NULL)
  const char *backend;             // the RV32 back end's bundle path
  const uint8_t *backend_digest;   // its digest when it is not under typed/, else NULL
  const uint8_t *linker;           // the linker bundle's digest
  const char *entry;               // the linker's entry function
  const uint8_t *reactor;          // the reactor ELF's digest
  const uint8_t *source;           // the source text's digest
  const char *policy;              // the RV32 policy name, or NULL for the default
} tc_inputs;
void tc_key(const tc_inputs *in, uint8_t key[32]);
void tc_name(const uint8_t key[32], char out[33]);   // the first 16 bytes in hex

typedef struct {
  uint8_t key[32];
  uint32_t length;
  uint8_t sha[32];
  uint32_t seq;
  uint32_t compile_us;
  char app[32];
  char label[40];   // the source the module was compiled from ("bundle", "edit", "candela/callback.typed", ...)
} tc_header;
void tc_header_encode(const tc_header *h, uint8_t out[TC_HEADER]);
bool tc_header_decode(const uint8_t in[TC_HEADER], tc_header *h, const char **why);

typedef enum { TC_HIT, TC_MISS, TC_CORRUPT, TC_NO_MEMORY } tc_result;
// A hit returns a malloc'ed, NUL-terminated copy of the module and its header.
tc_result tc_read(const char *dir, const uint8_t key[32], char **module, tc_header *h, char *why, size_t why_n);

// How much the cache may hold: per_label entries per (app, label), at most budget bytes in all, and at least
// reserve bytes of the volume left free after a store.
typedef struct { unsigned per_label; uint64_t budget, reserve; } tc_policy;
// A store in three steps, so the platform can hold its lock only around the deletes and the rename: prepare
// (create DIR, remove torn .tmp files and invalid entries, evict for h, choose h->seq; false if it cannot fit),
// write the .tmp, commit (rename it over the entry). free_bytes: the volume's free space before prepare.
bool tc_prepare(const char *dir, tc_header *h, uint64_t free_bytes, const tc_policy *p, char *why, size_t why_n);
#define TC_CHUNK 4096u
typedef bool (*tc_pace)(void *arg);   // false: stop the write
bool tc_write_tmp(const char *dir, const tc_header *h, const char *module, tc_pace pace, void *arg, char *why,
                  size_t why_n);
bool tc_commit(const char *dir, const uint8_t key[32], char *why, size_t why_n);
bool tc_exists(const char *dir, const uint8_t key[32]);   // a valid entry's header is there (the module is not read)

// Every *.cache file: its header when valid, its size; the callback returns false to stop.
typedef bool (*tc_each)(void *arg, const char *file, const tc_header *h, bool valid, long size);
int tc_list(const char *dir, tc_each each, void *arg);
int tc_clear(const char *dir);   // removes every *.cache file; returns how many
