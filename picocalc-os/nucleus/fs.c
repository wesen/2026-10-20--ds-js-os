// Files. A world reaches the filesystem only through an H_FS handle, which names a directory or one file under the
// port's root (port_fs_root: a directory on the host, a FAT partition on the ESP32-P4). Paths are relative and
// checked here before any I/O: no ".." can climb out of a handle, and names starting with a dot are reserved for
// this layer's temporary files. The operations are plain POSIX, so the same code runs against both roots.
// fs_execute runs one job and leaves its result as JSON; the vm and the port decide when and on which thread.
#include <dirent.h>
#include <errno.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include "nucleus.h"

#define TMP_PREFIX ".w-"   // a write goes to dir/.w-name first, then replaces name

static bool name_char(unsigned char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == ' ' || c == '.' || c == '_' ||
         c == '-' || c >= 0x80;   // UTF-8 names are allowed; FAT stores them as long file names
}
bool fs_path_ok(const char *p) {
  size_t n = strlen(p);
  if (n >= FS_PATH_MAX || (n && (p[0] == '/' || p[n - 1] == '/'))) return false;
  if (!utf8_valid((const unsigned char *)p, n)) return false;
  const char *seg = p;
  for (const char *c = p;; c++) {
    if (*c == '/' || !*c) {
      size_t len = (size_t)(c - seg);
      if (n && (!len || seg[0] == '.' || seg[len - 1] == ' ' || seg[len - 1] == '.')) return false;   // empty, ".", "..", hidden; FAT drops a trailing space or dot
      if (!*c) break;
      seg = c + 1;
    } else if (!name_char((unsigned char)*c)) return false;
  }
  return true;
}
bool fs_join(char *out, const char *base, const char *rel) {
  int k = snprintf(out, FS_PATH_MAX, "%s%s%s", base, *base && *rel ? "/" : "", rel);
  return k >= 0 && k < FS_PATH_MAX;
}
static bool full(char *out, size_t n, const char *path) {
  const char *root = port_fs_root();
  if (!root) return false;
  int k = snprintf(out, n, "%s%s%s", root, *path ? "/" : "", path);
  return k >= 0 && (size_t)k < n;
}

static void result(fs_job_t *j, int ok, const char *json) { j->ok = ok; j->json = xstrdup(json); }
static void error(fs_job_t *j, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
static void error(fs_job_t *j, const char *fmt, ...) {
  char m[160]; va_list ap; va_start(ap, fmt); vsnprintf(m, sizeof m, fmt, ap); va_end(ap);
  sbuf_t b = { 0 }; sb_json_str(&b, m);
  j->ok = 0; j->json = b.s;
}
static const char *shown(const char *path) { return *path ? path : "/"; }

int fs_kind(const char *path) {
  char f[FS_PATH_MAX + 64]; struct stat st;
  if (!full(f, sizeof f, path) || stat(f, &st)) return -1;
  return S_ISDIR(st.st_mode) ? 1 : 0;
}

bool fs_mkdirs(const char *path) {
  char f[FS_PATH_MAX + 64];
  if (!full(f, sizeof f, "")) return false;
  size_t root = strlen(f);
  if (!full(f, sizeof f, path)) return false;
  for (char *c = f + root + 1; *c; c++)
    if (*c == '/') { *c = 0; if (mkdir(f, 0755) && errno != EEXIST) return false; *c = '/'; }
  struct stat st;
  return !mkdir(f, 0755) || (errno == EEXIST && !stat(f, &st) && S_ISDIR(st.st_mode));
}

// A write interrupted between removing the old file and renaming the new one (FAT cannot rename over a name)
// leaves only dir/.w-name: put it in place the next time the directory or the file is looked at.
static void recover(const char *dir_full, const char *name) {
  char tmp[FS_PATH_MAX + 80], dst[FS_PATH_MAX + 80];
  struct stat st;
  snprintf(tmp, sizeof tmp, "%s/" TMP_PREFIX "%s", dir_full, name);
  snprintf(dst, sizeof dst, "%s/%s", dir_full, name);
  if (!stat(tmp, &st) && stat(dst, &st)) rename(tmp, dst);
}
static void split(const char *path, char *dir, char *base) {   // "a/b/c" -> "a/b", "c"
  const char *s = strrchr(path, '/');
  if (!s) { dir[0] = 0; snprintf(base, FS_PATH_MAX, "%s", path); return; }
  snprintf(dir, FS_PATH_MAX, "%.*s", (int)(s - path), path);
  snprintf(base, FS_PATH_MAX, "%s", s + 1);
}

typedef struct { char name[FS_PATH_MAX]; bool dir; long size; } entry_t;
static int by_name(const void *a, const void *b) { return strcmp(((const entry_t *)a)->name, ((const entry_t *)b)->name); }

static void do_list(fs_job_t *j, const char *f) {
  DIR *d = opendir(f);
  if (!d) { error(j, errno == ENOTDIR ? "%s is a file" : "no directory %s", shown(j->path)); return; }
  entry_t *e = malloc(sizeof(entry_t) * FS_LIST_MAX);
  int n = 0; bool more = false;
  struct dirent *de;
  while ((de = readdir(d))) {
    const char *nm = de->d_name;
    if (!strncmp(nm, TMP_PREFIX, strlen(TMP_PREFIX))) { recover(f, nm + strlen(TMP_PREFIX)); continue; }
    if (nm[0] == '.' || !fs_path_ok(nm)) continue;
    if (n == FS_LIST_MAX) { more = true; break; }
    char p[FS_PATH_MAX + 80]; struct stat st;
    snprintf(p, sizeof p, "%s/%s", f, nm);
    if (stat(p, &st)) continue;
    snprintf(e[n].name, sizeof e[n].name, "%s", nm);
    e[n].dir = S_ISDIR(st.st_mode); e[n].size = e[n].dir ? 0 : (long)st.st_size;
    n++;
  }
  closedir(d);
  // a recovered file has a new name now; one more pass would list it, but a recovery is rare and the next list shows it
  qsort(e, (size_t)n, sizeof *e, by_name);
  sbuf_t b = { 0 };
  sb_add(&b, "[");
  for (int i = 0; i < n; i++) {
    sb_add(&b, i ? ",{\"name\":" : "{\"name\":"); sb_json_str(&b, e[i].name);
    sb_printf(&b, ",\"dir\":%s,\"size\":%ld}", e[i].dir ? "true" : "false", e[i].size);
  }
  if (more) sb_add(&b, n ? ",{\"more\":true}" : "{\"more\":true}");
  sb_add(&b, "]");
  free(e);
  j->ok = 1; j->json = b.s;
}

static void do_read(fs_job_t *j, const char *f) {
  struct stat st;
  if (stat(f, &st)) {
    char dir[FS_PATH_MAX], base[FS_PATH_MAX], df[FS_PATH_MAX + 64];
    split(j->path, dir, base);
    if (full(df, sizeof df, dir)) recover(df, base);
    if (stat(f, &st)) { error(j, "no file %s", shown(j->path)); return; }
  }
  if (S_ISDIR(st.st_mode)) { error(j, "%s is a directory", shown(j->path)); return; }
  if (st.st_size > FS_FILE_MAX) { error(j, "%s is larger than %d bytes", j->path, FS_FILE_MAX); return; }
  FILE *fp = fopen(f, "rb");
  if (!fp) { error(j, "cannot open %s", j->path); return; }
  char *buf = malloc((size_t)st.st_size + 1);
  size_t n = buf ? fread(buf, 1, (size_t)st.st_size, fp) : 0;
  fclose(fp);
  if (!buf || n != (size_t)st.st_size) { free(buf); error(j, "cannot read %s", j->path); return; }
  buf[n] = 0;
  if (memchr(buf, 0, n) || !utf8_valid((const unsigned char *)buf, n)) { free(buf); error(j, "%s is not text (UTF-8)", j->path); return; }
  sbuf_t b = { 0 };
  sb_json_str(&b, buf);
  free(buf);
  j->ok = 1; j->json = b.s;
}

static bool write_all(const char *f, const char *mode, const char *data, size_t len) {
  FILE *fp = fopen(f, mode);
  if (!fp) return false;
  bool ok = fwrite(data, 1, len, fp) == len;
  if (fflush(fp)) ok = false;
  if (fsync(fileno(fp))) ok = false;
  if (fclose(fp)) ok = false;
  return ok;
}
static void do_write(fs_job_t *j, const char *f, bool append) {
  if (j->len > FS_FILE_MAX) { error(j, "a file is at most %d bytes", FS_FILE_MAX); return; }
  if (!utf8_valid((const unsigned char *)j->data, j->len)) { error(j, "the text is not valid UTF-8"); return; }
  struct stat st;
  bool exists = !stat(f, &st);
  if (exists && S_ISDIR(st.st_mode)) { error(j, "%s is a directory", j->path); return; }
  char dir[FS_PATH_MAX], base[FS_PATH_MAX], df[FS_PATH_MAX + 64];
  split(j->path, dir, base);
  if (!full(df, sizeof df, dir) || stat(df, &st) || !S_ISDIR(st.st_mode)) { error(j, "no directory %s", shown(dir)); return; }
  if (append) {
    long size = exists ? (long)(stat(f, &st) ? 0 : st.st_size) : 0;
    if (size + (long)j->len > FS_FILE_MAX) { error(j, "%s would be larger than %d bytes", j->path, FS_FILE_MAX); return; }
    if (!write_all(f, "ab", j->data, j->len)) { error(j, "cannot write %s (%s)", j->path, strerror(errno)); return; }
    char r[32]; snprintf(r, sizeof r, "{\"bytes\":%ld}", size + (long)j->len); result(j, 1, r);
    return;
  }
  char tmp[FS_PATH_MAX + 80];
  snprintf(tmp, sizeof tmp, "%s/" TMP_PREFIX "%s", df, base);
  if (!write_all(tmp, "wb", j->data, j->len)) { unlink(tmp); error(j, "cannot write %s (%s)", j->path, strerror(errno)); return; }
  if (rename(tmp, f)) {   // POSIX replaces atomically; FAT refuses an existing name, so remove it first
    if (unlink(f) || rename(tmp, f)) { error(j, "cannot replace %s (%s)", j->path, strerror(errno)); return; }
  }
  char r[32]; snprintf(r, sizeof r, "{\"bytes\":%zu}", j->len); result(j, 1, r);
}

static bool dir_empty(const char *f) {
  DIR *d = opendir(f);
  if (!d) return false;
  struct dirent *de; bool empty = true;
  while (empty && (de = readdir(d))) if (strcmp(de->d_name, ".") && strcmp(de->d_name, "..")) empty = false;
  closedir(d);
  return empty;
}

void fs_execute(fs_job_t *j) {
  char f[FS_PATH_MAX + 64], g[FS_PATH_MAX + 64];
  struct stat st;
  if (!port_fs_root()) { error(j, "this device has no filesystem"); return; }
  if (!full(f, sizeof f, j->path)) { error(j, "path too long"); return; }
  switch (j->op) {
  case FS_LIST: do_list(j, f); break;
  case FS_READ: do_read(j, f); break;
  case FS_WRITE: do_write(j, f, false); break;
  case FS_APPEND: do_write(j, f, true); break;
  case FS_STAT:
    if (stat(f, &st)) error(j, "no file %s", shown(j->path));
    else { char r[64]; snprintf(r, sizeof r, "{\"dir\":%s,\"size\":%ld}", S_ISDIR(st.st_mode) ? "true" : "false", S_ISDIR(st.st_mode) ? 0L : (long)st.st_size); result(j, 1, r); }
    break;
  case FS_MKDIR:
    if (!stat(f, &st)) { if (S_ISDIR(st.st_mode)) result(j, 1, "true"); else error(j, "%s is a file", j->path); }
    else if (mkdir(f, 0755)) error(j, "cannot make %s (%s)", j->path, strerror(errno));
    else result(j, 1, "true");
    break;
  case FS_REMOVE:
    if (!*j->path) error(j, "the root cannot be removed");
    else if (stat(f, &st)) error(j, "no file %s", j->path);
    else if (S_ISDIR(st.st_mode) && !dir_empty(f)) error(j, "%s is not empty", j->path);   // FAT does not say ENOTEMPTY
    else if (S_ISDIR(st.st_mode) ? rmdir(f) : unlink(f)) error(j, "cannot remove %s (%s)", j->path, strerror(errno));
    else result(j, 1, "true");
    break;
  case FS_RENAME:
    if (!full(g, sizeof g, j->path2)) { error(j, "path too long"); break; }
    if (!*j->path || !*j->path2) error(j, "the root cannot be renamed");
    else if (stat(f, &st)) error(j, "no file %s", j->path);
    else if (!stat(g, &st)) error(j, "%s already exists", j->path2);
    else if (rename(f, g)) error(j, "cannot rename %s (%s)", j->path, strerror(errno));
    else result(j, 1, "true");
    break;
  case FS_INFO: {
    uint64_t total = 0, free_bytes = 0;
    if (port_fs_info(&total, &free_bytes)) error(j, "cannot read the filesystem's size");
    else { char r[64]; snprintf(r, sizeof r, "{\"total\":%llu,\"free\":%llu}", (unsigned long long)total, (unsigned long long)free_bytes); result(j, 1, r); }
    break;
  }
  default: error(j, "no such file operation");
  }
}

void fs_job_free(fs_job_t *j) {
  if (!j) return;
  free(j->data); free(j->json); free(j);
}
