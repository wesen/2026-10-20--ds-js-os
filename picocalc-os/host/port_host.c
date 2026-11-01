// The host's port: the C library's allocator and files (the board's name and buses are in its sim/board.c). The host runs on
// the virtual clock, so port_clock is only there for completeness.
#include <errno.h>
#include <fcntl.h>
#include <malloc.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <ftw.h>
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
  mkdir(dir, 0700);
  char p[300];
  snprintf(p, sizeof p, "%s/w", dir); mkdir(p, 0700);
  snprintf(p, sizeof p, "%s/k", dir); mkdir(p, 0700);
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
  if (!b) return NULL;
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
    char tmp[320];
    snprintf(tmp, sizeof tmp, "%s/.%s.XXXXXX", store_dir, key);
    int fd = mkstemp(tmp);
    if (fd < 0) return -1;
    FILE *f = fdopen(fd, "wb");
    if (!f) { close(fd); unlink(tmp); return -1; }
    bool ok = fwrite(data, 1, len, f) == len;
    if (fflush(f) || fsync(fd)) ok = false;
    if (fclose(f)) ok = false;
    if (ok && rename(tmp, p) == 0) {
      char dir[300]; snprintf(dir, sizeof dir, "%s/%s", store_dir, ns);
      int dfd = open(dir, O_RDONLY | O_DIRECTORY);
      if (dfd < 0) return -1;
      int rc = fsync(dfd); close(dfd); return rc ? -1 : 0;
    }
    unlink(tmp); return -1;
  }
  rec_t **at = rec_find(ns, key), *r = *at;
  if (!len) { if (r) { *at = r->next; free(r->data); free(r); } return 0; }
  char *copy = malloc(len);
  if (!copy) return -1;
  memcpy(copy, data, len);
  if (!r) {
    r = calloc(1, sizeof *r);
    if (!r) { free(copy); return -1; }
    snprintf(r->ns, sizeof r->ns, "%s", ns); snprintf(r->key, sizeof r->key, "%s", key); *at = r;
  }
  free(r->data); r->data = copy; r->len = len;
  return 0;
}

// ---- files: a directory stands in for the device's FAT partition --------------------------------------------------
static char fs_root[512];
void host_fs_root(const char *dir) {
  snprintf(fs_root, sizeof fs_root, "%s", dir);
  mkdir(fs_root, 0755);
}
const char *port_fs_root(void) { return fs_root[0] ? fs_root : NULL; }

// The wall clock: a start time plus virtual time. By default the start is the prelude's old fixed boot time, so
// screenshots stay the same from run to run; -w sets another start, "now", or "unset" (an unknown time).
static int64_t wall_base = 1792662060000LL;   // Date.UTC(2026, 9, 22, 9, 41)
static bool wall_unset;
int host_wall(const char *spec) {
  struct tm tm = { 0 };
  int sec = 0;
  if (!strcmp(spec, "unset")) { wall_unset = true; return 0; }
  wall_unset = false;
  if (!strcmp(spec, "now")) { struct timespec ts; clock_gettime(CLOCK_REALTIME, &ts); wall_base = (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000; return 0; }
  if (sscanf(spec, "%d-%d-%dT%d:%d:%d", &tm.tm_year, &tm.tm_mon, &tm.tm_mday, &tm.tm_hour, &tm.tm_min, &sec) < 5) return -1;
  tm.tm_year -= 1900; tm.tm_mon -= 1; tm.tm_sec = sec; tm.tm_isdst = -1;   // local time in the zone TZ names
  time_t t = mktime(&tm);
  if (t == (time_t)-1) return -1;
  wall_base = (int64_t)t * 1000;
  return 0;
}
int64_t port_wall_ms(void) { return wall_unset ? -1 : wall_base + kernel_now() / 1000; }
// The job runs now; its promise settles after a modelled cost (2 ms, plus 1 us a byte), so scripts stay repeatable.
void port_fs_submit(fs_job_t *j, vtime_t at) {
  fs_execute(j);
  size_t bytes = j->len + (j->json ? strlen(j->json) : 0);
  if (j->done) j->done(j, at + MS(2) + (vtime_t)bytes);
  else { kernel_settle_at(j->w, j->epoch, j->promise, j->ok, j->json, at + MS(2) + (vtime_t)bytes); j->json = NULL; }
  fs_job_free(j);
}
// The host reports a volume the size of the P4's FAT partition, less what the root holds in 4 KB clusters, so
// the numbers are the device's and a capture does not change with the free space of the disk the tests run on.
#define HOST_FS_TOTAL (11956ull * 1024)
static uint64_t used_bytes;
static int add_used(const char *p, const struct stat *st, int kind, struct FTW *f) {
  (void)p; (void)f;
  used_bytes += kind == FTW_F ? ((uint64_t)st->st_size + 4095) / 4096 * 4096 : 4096;
  return 0;
}
int port_fs_info(uint64_t *total, uint64_t *free_bytes) {
  used_bytes = 0;
  if (!fs_root[0] || nftw(fs_root, add_used, 16, FTW_PHYS)) return -1;
  *total = HOST_FS_TOTAL; *free_bytes = used_bytes < HOST_FS_TOTAL ? HOST_FS_TOTAL - used_bytes : 0;
  return 0;
}

// One thread runs the kernel and everything that logs on the host, so the log ring needs no lock.
void port_log_lock(void) { }
void port_log_unlock(void) { }
