// The host's port: the C library's allocator and files (the board's name and buses are in its sim/board.c). The host runs on
// the virtual clock, so port_clock is only there for completeness.
#include <errno.h>
#include <malloc.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#include "../nucleus/nucleus.h"

vtime_t port_clock(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (vtime_t)ts.tv_sec * 1000000 + ts.tv_nsec / 1000;
}
void *port_heap_malloc(size_t n) { return malloc(n); }
void *port_heap_realloc(void *p, size_t n) { return realloc(p, n); }
void port_heap_free(void *p) { free(p); }
size_t port_heap_usable(const void *p) { return malloc_usable_size((void *)p); }
void *port_big_calloc(size_t n) { return calloc(1, n); }
void port_big_free(void *p) { free(p); }
size_t port_js_stack(void) { return 192 * 1024; }
char *port_read_file(const char *path, size_t *len) { return read_file(path, len); }

// The persistent store: records in memory, so each run starts empty and captures stay the same; with the runner's
// -s DIR, files DIR/<ns>/<key> instead, so a run can start from a store or leave one to look at. Either way the
// records belong to the board and outlive a simulated power cycle.
typedef struct rec { struct rec *next; char ns[4], key[16]; char *data; size_t len; } rec_t;
static rec_t *recs;
static char store_dir[256];

void host_store_dir(const char *dir) {
  snprintf(store_dir, sizeof store_dir, "%s", dir);
  mkdir(dir, 0755);
  char p[300];
  snprintf(p, sizeof p, "%s/w", dir); mkdir(p, 0755);
  snprintf(p, sizeof p, "%s/k", dir); mkdir(p, 0755);
}

static rec_t **rec_find(const char *ns, const char *key) {
  rec_t **r = &recs;
  while (*r && (strcmp((*r)->ns, ns) || strcmp((*r)->key, key))) r = &(*r)->next;
  return r;
}

char *port_store_get(const char *ns, const char *key, size_t *len) {
  if (strlen(ns) > 3 || strlen(key) > 15) return NULL;
  if (store_dir[0]) {
    char p[300];
    snprintf(p, sizeof p, "%s/%s/%s", store_dir, ns, key);
    return read_file(p, len);
  }
  rec_t *r = *rec_find(ns, key);
  if (!r) return NULL;
  char *b = malloc(r->len + 1);
  memcpy(b, r->data, r->len); b[r->len] = 0;
  if (len) *len = r->len;
  return b;
}

int port_store_set(const char *ns, const char *key, const void *data, size_t len) {
  if (strlen(ns) > 3 || strlen(key) > 15) return -1;
  if (store_dir[0]) {
    char p[300];
    snprintf(p, sizeof p, "%s/%s/%s", store_dir, ns, key);
    if (!len) return unlink(p) && errno != ENOENT ? -1 : 0;
    FILE *f = fopen(p, "wb");
    if (!f) return -1;
    int ok = fwrite(data, 1, len, f) == len;
    return fclose(f) || !ok ? -1 : 0;
  }
  rec_t **at = rec_find(ns, key), *r = *at;
  if (!len) { if (r) { *at = r->next; free(r->data); free(r); } return 0; }
  if (!r) { r = calloc(1, sizeof *r); snprintf(r->ns, sizeof r->ns, "%s", ns); snprintf(r->key, sizeof r->key, "%s", key); *at = r; }
  free(r->data);
  r->data = malloc(len); memcpy(r->data, data, len); r->len = len;
  return 0;
}
