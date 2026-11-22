// candela-bc: compile the Candela world's ES modules to QuickJS bytecode when the firmware is built
// (PICOCALC-CANDELA-WORLD). Built for the build machine from the same third_party/quickjs as the firmware;
// QuickJS bytecode depends on the QuickJS version and byte order, not on the word size, so the device reads
// what this writes (nucleus/candela_world.c checks the version string below and JS_ReadObject checks BC_VERSION).
//
//   candela-bc OUT [--module NAME=PATH]... [--text NAME=PATH]... [--ggx KERNEL.js --memo NAME=TEMPLATE.js]
//   candela-bc OUT --list LIST ROOT      the same, one per line of LIST, paths relative to ROOT:
//                                        "module NAME PATH", "text NAME PATH", "text-dir PREFIX DIR" (every file in
//                                        DIR as PREFIX<file name>, sorted), "ggx PATH", "memo NAME PATH"; # comments
//
// --module  compiles PATH as an ES module whose name (and file name in stack traces) is NAME
// --text    stores PATH's bytes under NAME (preset scenes, indexes)
// --ggx     evaluates Candela's kernel.js here, once, and calls its ggxAlbedoTable() and ggxTableWGSL(): the
//           constant GGX albedo table is 26.7 million QuickJS steps, minutes on the ESP32-P4
// --memo    compiles TEMPLATE as module NAME after replacing /*@GGX_TABLE@*/ and /*@GGX_WGSL@*/ (each exactly
//           once) with the JSON of those two results
//
// The output ("CQB1"): magic, the QuickJS version as a NUL-terminated string padded to 16 bytes, an entry count,
// then per entry: u8 kind (1 module bytecode, 2 text), u8 0, u16 name length, the name, u32 data length, the data.
// All integers little-endian. Function source text is stripped (JS_STRIP_SOURCE); line tables are kept, so
// stack traces still name Candela's lines.
#include <dirent.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quickjs.h"

#ifndef CONFIG_VERSION
#error "build with -DCONFIG_VERSION=\"...\" as the firmware does"
#endif

static void die(const char *fmt, const char *a) { fprintf(stderr, "candela-bc: "); fprintf(stderr, fmt, a); fputc('\n', stderr); exit(1); }

static char *read_file(const char *path, size_t *n) {
  FILE *f = fopen(path, "rb");
  if (!f) die("cannot read %s", path);
  fseek(f, 0, SEEK_END); long len = ftell(f); fseek(f, 0, SEEK_SET);
  char *b = malloc((size_t)len + 1);
  if (!b || fread(b, 1, (size_t)len, f) != (size_t)len) die("cannot read %s", path);
  b[len] = 0; fclose(f);
  *n = (size_t)len;
  return b;
}

static void exception(JSContext *ctx, const char *what) {
  JSValue e = JS_GetException(ctx);
  const char *m = JS_ToCString(ctx, e);
  JSValue st = JS_IsError(ctx, e) ? JS_GetPropertyStr(ctx, e, "stack") : JS_UNDEFINED;
  const char *s = JS_IsString(st) ? JS_ToCString(ctx, st) : NULL;
  fprintf(stderr, "candela-bc: %s: %s\n%s", what, m ? m : "?", s ? s : "");
  exit(1);
}

typedef struct { uint8_t kind; char *name; uint8_t *data; uint32_t len; } entry_t;
static entry_t entries[256]; static int n_entries;

static void add(uint8_t kind, const char *name, const uint8_t *data, size_t len) {
  if (n_entries == 256) die("too many entries (%s)", name);
  if (strlen(name) > 200) die("name too long: %s", name);
  for (int i = 0; i < n_entries; i++) if (!strcmp(entries[i].name, name)) die("duplicate entry %s", name);
  entry_t *e = &entries[n_entries++];
  e->kind = kind; e->name = strdup(name); e->len = (uint32_t)len;
  e->data = malloc(len ? len : 1); memcpy(e->data, data, len);
}

// Modules are compiled after every entry is known: QuickJS resolves a module's imports when it compiles it, so
// compiling one compiles (through the loader below) the modules it imports, each once, under its own name.
typedef struct { char *name, *src; size_t len; bool done; } source_t;
static source_t sources[64]; static int n_sources;
static void queue_module(const char *name, char *src, size_t len) {
  if (n_sources == 64) die("too many modules (%s)", name);
  sources[n_sources++] = (source_t){ strdup(name), src, len, false };
}
static JSModuleDef *compile_module(JSContext *ctx, source_t *m);

// The same names as the device (nucleus/candela_world.c cw_normalize): scheme-relative imports, and every import of
// candela:kernel.js but the memo module's own goes to world:kernel-memo.js.
static char *bc_normalize(JSContext *ctx, const char *base, const char *name, void *opaque) {
  (void)opaque;
  char out[128];
  if (strchr(name, ':')) snprintf(out, sizeof out, "%s", name);
  else if (!strncmp(name, "./", 2) && !strchr(name + 2, '/') && strchr(base, ':'))
    snprintf(out, sizeof out, "%.*s%s", (int)(strchr(base, ':') - base + 1), base, name + 2);
  else { JS_ThrowReferenceError(ctx, "cannot resolve '%s' from %s", name, base); return NULL; }
  if (!strcmp(out, "candela:kernel.js") && strcmp(base, "world:kernel-memo.js")) snprintf(out, sizeof out, "world:kernel-memo.js");
  char *r = js_malloc(ctx, strlen(out) + 1);
  if (r) strcpy(r, out);
  return r;
}
static JSModuleDef *bc_load(JSContext *ctx, const char *name, void *opaque) {
  (void)opaque;
  for (int i = 0; i < n_sources; i++) if (!strcmp(sources[i].name, name)) return compile_module(ctx, &sources[i]);
  JS_ThrowReferenceError(ctx, "%s is imported but not in the bundle", name);
  return NULL;
}

static JSModuleDef *compile_module(JSContext *ctx, source_t *m) {
  if (m->done) die("%s compiled twice", m->name);
  m->done = true;
  JSValue v = JS_Eval(ctx, m->src, m->len, m->name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(v)) exception(ctx, m->name);
  size_t n = 0;
  uint8_t *bc = JS_WriteObject(ctx, &n, v, JS_WRITE_OBJ_BYTECODE);
  if (!bc) exception(ctx, m->name);
  add(1, m->name, bc, n);
  js_free(ctx, bc);
  JSModuleDef *def = JS_VALUE_GET_PTR(v);
  JS_FreeValue(ctx, v);
  return def;
}

// Replace the only occurrence of token in text with value; fail if it occurs zero or several times.
static char *replace_once(char *text, const char *token, const char *value, const char *where) {
  char *at = strstr(text, token);
  if (!at || strstr(at + 1, token)) die("%s: the token must occur exactly once", where);
  size_t a = (size_t)(at - text), tl = strlen(token), vl = strlen(value), rest = strlen(at + tl);
  char *out = malloc(a + vl + rest + 1);
  memcpy(out, text, a); memcpy(out + a, value, vl); memcpy(out + a + vl, at + tl, rest + 1);
  free(text);
  return out;
}

static char *ggx_table, *ggx_wgsl;   // JSON texts
static void compute_ggx(const char *kernel_path) {
  JSRuntime *rt = JS_NewRuntime();
  JS_SetMaxStackSize(rt, 4 * 1024 * 1024);
  JSContext *ctx = JS_NewContext(rt);
  size_t n; char *src = read_file(kernel_path, &n);
  JSValue fn = JS_Eval(ctx, src, n, "candela:kernel.js", JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(fn)) exception(ctx, kernel_path);
  JSModuleDef *mod = JS_VALUE_GET_PTR(fn);
  JSValue r = JS_EvalFunction(ctx, fn);   // kernel.js imports nothing; evaluating it settles at once
  if (JS_IsException(r)) exception(ctx, kernel_path);
  JS_FreeValue(ctx, r);
  JSValue ns = JS_GetModuleNamespace(ctx, mod);
  const char *names[2] = { "ggxAlbedoTable", "ggxTableWGSL" };
  char **outs[2] = { &ggx_table, &ggx_wgsl };
  for (int i = 0; i < 2; i++) {
    JSValue f = JS_GetPropertyStr(ctx, ns, names[i]);
    JSValue v = JS_Call(ctx, f, JS_UNDEFINED, 0, NULL);
    if (JS_IsException(v)) exception(ctx, names[i]);
    JSValue j = JS_JSONStringify(ctx, v, JS_UNDEFINED, JS_UNDEFINED);
    const char *s = JS_ToCString(ctx, j);
    if (!s) exception(ctx, names[i]);
    *outs[i] = strdup(s);
    JS_FreeCString(ctx, s); JS_FreeValue(ctx, j); JS_FreeValue(ctx, v); JS_FreeValue(ctx, f);
  }
  JS_FreeValue(ctx, ns);
  free(src);
  JS_FreeContext(ctx); JS_FreeRuntime(rt);
}

static void do_entry(JSContext *ctx, const char *opt, const char *name, const char *path) {
  if (!strcmp(opt, "ggx")) { compute_ggx(path); return; }
  size_t n; char *text = read_file(path, &n);
  (void)ctx;
  if (!strcmp(opt, "module")) { queue_module(name, text, n); return; }
  if (!strcmp(opt, "memo")) {
    if (!ggx_table) die("memo %s needs ggx before it", name);
    text = replace_once(text, "/*@GGX_TABLE@*/", ggx_table, name);
    text = replace_once(text, "/*@GGX_WGSL@*/", ggx_wgsl, name);
    queue_module(name, text, strlen(text));
    return;
  }
  if (!strcmp(opt, "text")) add(2, name, (uint8_t *)text, n);
  else die("unknown entry kind %s", opt);
  free(text);
}

static int cmp_str(const void *a, const void *b) { return strcmp(*(char *const *)a, *(char *const *)b); }
static void text_dir(const char *prefix, const char *dir) {
  DIR *d = opendir(dir);
  if (!d) die("cannot list %s", dir);
  char *names[512]; int n = 0;
  for (struct dirent *e; (e = readdir(d));) if (e->d_name[0] != '.' && n < 512) names[n++] = strdup(e->d_name);
  closedir(d);
  qsort(names, n, sizeof *names, cmp_str);
  for (int i = 0; i < n; i++) {
    char path[1400], name[256]; size_t len;
    snprintf(path, sizeof path, "%s/%s", dir, names[i]); snprintf(name, sizeof name, "%s%s", prefix, names[i]);
    char *text = read_file(path, &len);
    add(2, name, (uint8_t *)text, len);
    free(text); free(names[i]);
  }
}

static void do_list(JSContext *ctx, const char *list, const char *root) {
  size_t n; char *text = read_file(list, &n);
  for (char *line = strtok(text, "\n"); line; line = strtok(NULL, "\n")) {
    char kind[16], a[256], b[512], path[1024];
    if (line[0] == '#' || !line[strspn(line, " \t\r")]) continue;
    int k = sscanf(line, "%15s %255s %511s", kind, a, b);
    if (!strcmp(kind, "ggx") && k >= 2) { snprintf(path, sizeof path, "%s/%s", root, a); compute_ggx(path); continue; }
    if (k != 3) die("bad list line: %s", line);
    snprintf(path, sizeof path, "%s/%s", root, b);
    if (!strcmp(kind, "text-dir")) text_dir(a, path);
    else do_entry(ctx, kind, a, path);
  }
  free(text);
}

static void put32(FILE *f, uint32_t v) { uint8_t b[4] = { v, v >> 8, v >> 16, v >> 24 }; fwrite(b, 1, 4, f); }
static void put16(FILE *f, uint16_t v) { uint8_t b[2] = { v, v >> 8 }; fwrite(b, 1, 2, f); }

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: candela-bc OUT [--module NAME=PATH]... [--text NAME=PATH]... [--ggx KERNEL --memo NAME=TEMPLATE]\n"); return 2; }
  const char *out = argv[1];
  JSRuntime *rt = JS_NewRuntime();
  JS_SetStripInfo(rt, JS_STRIP_SOURCE);
  JS_SetModuleLoaderFunc(rt, bc_normalize, bc_load, NULL);
  JSContext *ctx = JS_NewContext(rt);
  for (int i = 2; i < argc; i++) {
    const char *opt = argv[i], *arg = i + 1 < argc ? argv[i + 1] : NULL;
    if (!arg) die("%s needs an argument", opt);
    i++;
    if (!strcmp(opt, "--ggx")) { compute_ggx(arg); continue; }
    if (!strcmp(opt, "--list")) { if (i + 1 >= argc) die("--list %s needs a ROOT", arg); do_list(ctx, arg, argv[++i]); continue; }
    const char *eq = strchr(arg, '=');
    if (!eq || strncmp(opt, "--", 2)) die("expected --KIND NAME=PATH, got %s", arg);
    char name[256]; snprintf(name, sizeof name, "%.*s", (int)(eq - arg), arg);
    do_entry(ctx, opt + 2, name, eq + 1);
  }
  for (int i = 0; i < n_sources; i++) if (!sources[i].done) compile_module(ctx, &sources[i]);
  FILE *f = fopen(out, "wb");
  if (!f) die("cannot write %s", out);
  fwrite("CQB1", 1, 4, f);
  char ver[16] = { 0 }; snprintf(ver, sizeof ver, "%s", CONFIG_VERSION); fwrite(ver, 1, 16, f);
  put32(f, (uint32_t)n_entries);
  size_t total = 0;
  for (int i = 0; i < n_entries; i++) {
    entry_t *e = &entries[i];
    fputc(e->kind, f); fputc(0, f); put16(f, (uint16_t)strlen(e->name)); fwrite(e->name, 1, strlen(e->name), f);
    put32(f, e->len); fwrite(e->data, 1, e->len, f);
    total += e->len;
  }
  if (fclose(f)) die("cannot write %s", out);
  int modules = 0; for (int i = 0; i < n_entries; i++) modules += entries[i].kind == 1;
  printf("candela-bc: %s: %d modules, %d texts, %zu data bytes\n", out, modules, n_entries - modules, total);
  JS_FreeContext(ctx); JS_FreeRuntime(rt);
  return 0;
}
