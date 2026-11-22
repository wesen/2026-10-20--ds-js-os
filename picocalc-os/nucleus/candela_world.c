// The Candela world's host side (candela_world.h). Built with PICOCALC_CANDELA_WORLD.
//
// Module names. Candela's modules are candela:<file> (candela:scene.js), the world's are world:<file>. Neither
// contains a '/', which matters: Candela's callSite() takes the first stack frame whose file's base name is a user
// file such as scene.js, and a name like src/scene.js would match Candela's own scene.js before the user's. A
// relative import resolves within its own namespace; every import of candela:kernel.js except the memo module's
// own resolves to world:kernel-memo.js (the constant GGX table, see worlds/candela-world/kernel-memo.js).
//
// The bundle (tools/candela-bc.c "CQB1") is read once with port_read_file and kept for the life of the firmware;
// JS_ReadObject copies what it needs from it into the world's heap.
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "candela_world.h"
#include "candela_render.h"
#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/idf_additions.h"
#endif

// ---- the bundle ----------------------------------------------------------------------------------------------
typedef struct { uint8_t kind; char name[96]; const uint8_t *data; uint32_t len; } cw_entry;
static struct { char *buf; size_t len; cw_entry *e; int n; bool tried; char error[120]; } B;
static struct { uint32_t modules, bytes; int64_t read_us; } stats;   // since boot, over every Candela world

static uint32_t rd32(const uint8_t *p) { return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }
static int bundle_load(void) {
  if (B.tried) return B.e ? 0 : -1;
  B.tried = true;
  char path[300];
  snprintf(path, sizeof path, "%s/%s", K.js_root, CANDELA_BUNDLE);
  B.buf = port_read_file(path, &B.len);
  const uint8_t *p = (const uint8_t *)B.buf, *end = p + B.len;
  if (!B.buf || B.len < 24 || memcmp(p, "CQB1", 4)) { snprintf(B.error, sizeof B.error, "%s is missing or not a Candela bundle", path); return -1; }
  if (strncmp((const char *)p + 4, CONFIG_VERSION, 16)) { snprintf(B.error, sizeof B.error, "%s was written by QuickJS %.16s, this is %s", path, (const char *)p + 4, CONFIG_VERSION); return -1; }
  uint32_t n = rd32(p + 20);
  p += 24;
  B.e = calloc(n ? n : 1, sizeof *B.e);
  for (uint32_t i = 0; i < n; i++) {
    if (end - p < 4) goto bad;
    cw_entry *e = &B.e[i];
    e->kind = p[0];
    unsigned nl = p[2] | p[3] << 8;
    p += 4;
    if ((size_t)(end - p) < nl + 4u || nl >= sizeof e->name) goto bad;
    memcpy(e->name, p, nl); e->name[nl] = 0; p += nl;
    e->len = rd32(p); p += 4;
    if ((size_t)(end - p) < e->len) goto bad;
    e->data = p; p += e->len;
  }
  B.n = (int)n;
  return 0;
bad:
  free(B.e); B.e = NULL;
  snprintf(B.error, sizeof B.error, "%s is truncated", path);
  return -1;
}
static const cw_entry *bundle_find(int kind, const char *name) {
  for (int i = 0; i < B.n; i++) if (B.e[i].kind == kind && !strcmp(B.e[i].name, name)) return &B.e[i];
  return NULL;
}

// ---- modules -------------------------------------------------------------------------------------------------
static char *cw_normalize(JSContext *ctx, const char *base, const char *name, void *opaque) {
  (void)opaque;
  char out[128];
  if (strchr(name, ':')) snprintf(out, sizeof out, "%s", name);
  else if (!strncmp(name, "./", 2) && !strchr(name + 2, '/') && strchr(base, ':'))
    snprintf(out, sizeof out, "%.*s%s", (int)(strchr(base, ':') - base + 1), base, name + 2);
  else { JS_ThrowReferenceError(ctx, "cannot resolve '%s' from %s (Candela world modules are candela:NAME and world:NAME)", name, base); return NULL; }
  if (!strcmp(out, "candela:kernel.js") && strcmp(base, "world:kernel-memo.js")) snprintf(out, sizeof out, "world:kernel-memo.js");
  size_t n = strlen(out);
  char *r = js_malloc(ctx, n + 1);
  if (r) memcpy(r, out, n + 1);
  return r;
}

static JSModuleDef *cw_load(JSContext *ctx, const char *name, void *opaque) {
  (void)opaque;
  const cw_entry *e = bundle_find(1, name);
  if (!e) { JS_ThrowReferenceError(ctx, "%s is not in %s", name, CANDELA_BUNDLE); return NULL; }
  vtime_t t0 = port_clock();
  JSValue v = JS_ReadObject(ctx, e->data, e->len, JS_READ_OBJ_BYTECODE);
  stats.read_us += port_clock() - t0;
  if (JS_IsException(v)) return NULL;
  if (JS_VALUE_GET_TAG(v) != JS_TAG_MODULE) { JS_FreeValue(ctx, v); JS_ThrowTypeError(ctx, "%s is not a module", name); return NULL; }
  stats.modules++; stats.bytes += e->len;
  JSModuleDef *m = JS_VALUE_GET_PTR(v);
  JS_FreeValue(ctx, v);   // the context's module list keeps it
  return m;
}

// ---- SHA-256 (FIPS 180-4) ------------------------------------------------------------------------------------
typedef struct { uint32_t h[8]; uint8_t b[64]; uint64_t n; } sha_t;
static const uint32_t SK[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
  0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
  0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
  0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2 };
#define ROR(x, n) ((x) >> (n) | (x) << (32 - (n)))
static void sha_block(sha_t *s, const uint8_t *p) {
  uint32_t w[64], a[8];
  for (int i = 0; i < 16; i++) w[i] = (uint32_t)p[4 * i] << 24 | p[4 * i + 1] << 16 | p[4 * i + 2] << 8 | p[4 * i + 3];
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = ROR(w[i - 15], 7) ^ ROR(w[i - 15], 18) ^ w[i - 15] >> 3, s1 = ROR(w[i - 2], 17) ^ ROR(w[i - 2], 19) ^ w[i - 2] >> 10;
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  memcpy(a, s->h, sizeof a);
  for (int i = 0; i < 64; i++) {
    uint32_t t1 = a[7] + (ROR(a[4], 6) ^ ROR(a[4], 11) ^ ROR(a[4], 25)) + ((a[4] & a[5]) ^ (~a[4] & a[6])) + SK[i] + w[i];
    uint32_t t2 = (ROR(a[0], 2) ^ ROR(a[0], 13) ^ ROR(a[0], 22)) + ((a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]));
    memmove(a + 1, a, 7 * sizeof *a);
    a[4] += t1; a[0] = t1 + t2;
  }
  for (int i = 0; i < 8; i++) s->h[i] += a[i];
}
static void sha_init(sha_t *s) {
  static const uint32_t H0[8] = { 0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19 };
  memcpy(s->h, H0, sizeof H0); s->n = 0;
}
static void sha_update(sha_t *s, const uint8_t *p, size_t n) {
  while (n) {
    size_t k = s->n % 64, take = 64 - k < n ? 64 - k : n;
    memcpy(s->b + k, p, take); s->n += take; p += take; n -= take;
    if (s->n % 64 == 0) sha_block(s, s->b);
  }
}
static void sha_hex(sha_t *s, char out[65]) {
  uint64_t bits = s->n * 8;
  uint8_t pad = 0x80, z = 0, len[8];
  sha_update(s, &pad, 1);
  while (s->n % 64 != 56) sha_update(s, &z, 1);
  for (int i = 0; i < 8; i++) len[i] = (uint8_t)(bits >> (56 - 8 * i));
  sha_update(s, len, 8);
  for (int i = 0; i < 8; i++) snprintf(out + 8 * i, 9, "%08lx", (unsigned long)s->h[i]);
}

// ---- the host object -----------------------------------------------------------------------------------------
#define WORLD ((world_t *)JS_GetContextOpaque(ctx))
static uint8_t *stack_top;   // about where QuickJS measures the world's C stack from (its runtime was made here)

// A typed array's bytes and element size: false (and no exception left) if v is not a typed array.
static bool typed_bytes(JSContext *ctx, JSValueConst v, const uint8_t **out, size_t *n, size_t *el) {
  size_t off = 0, len = 0, cap = 0;
  *out = NULL; *n = 0; *el = 0;
  if (!JS_IsObject(v)) return false;
  JSValue ab = JS_GetTypedArrayBuffer(ctx, v, &off, &len, el);
  if (JS_IsException(ab)) { JS_FreeValue(ctx, JS_GetException(ctx)); return false; }
  uint8_t *p = JS_GetArrayBuffer(ctx, &cap, ab);
  JS_FreeValue(ctx, ab);
  if (!p || off + len > cap) return false;
  *out = p + off; *n = len;
  return true;
}

static JSValue h_now(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) { return JS_NewFloat64(ctx, port_clock() / 1000.0); }
static JSValue h_segment_ms(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) { return JS_NewFloat64(ctx, (kernel_now() - K.vnow) / 1000.0); }
static JSValue h_steps(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  world_t *W = WORLD;
  int init = JS_GetInterruptCounterInit();
  return JS_NewFloat64(ctx, (double)W->interrupts * init + init - JS_GetInterruptCounter(ctx));
}
static JSValue h_mem(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  world_t *W = WORLD;
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "used", JS_NewFloat64(ctx, (double)W->mem_used));
  JS_SetPropertyStr(ctx, o, "peak", JS_NewFloat64(ctx, (double)W->mem_peak));
  JS_SetPropertyStr(ctx, o, "limit", JS_NewFloat64(ctx, (double)W->mem_limit));
  return o;
}
static JSValue h_reset_peak(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) { WORLD->mem_peak = WORLD->mem_used; return JS_UNDEFINED; }
static JSValue h_gc(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) { JS_RunGC(JS_GetRuntime(ctx)); return JS_UNDEFINED; }
static JSValue h_long_segment(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  char why[160];
  if (vm_long_segment(WORLD, why, sizeof why)) return JS_ThrowInternalError(ctx, "%s", why);
  return JS_UNDEFINED;
}
static JSValue h_loader_stats(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "modules", JS_NewInt32(ctx, (int32_t)stats.modules));
  JS_SetPropertyStr(ctx, o, "bytes", JS_NewFloat64(ctx, stats.bytes));
  JS_SetPropertyStr(ctx, o, "readUs", JS_NewFloat64(ctx, (double)stats.read_us));
  return o;
}

// The C stack: paint the free stack below this call with a pattern; later, the lowest byte that changed is the
// deepest the world went. Reported as bytes below stack_top, the number to compare with the world's stack limit.
#define PAINT 0xA5
static uint8_t *paint_lo, *paint_hi;
static JSValue h_stack_paint(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  uint8_t *sp = __builtin_frame_address(0);
#ifdef ESP_PLATFORM
  uint8_t *lo = pxTaskGetStackStart(NULL) + 256;
#else
  uint8_t *lo = sp - 512 * 1024;
#endif
  paint_hi = sp - 512; paint_lo = lo;
  for (volatile uint8_t *p = paint_lo; p < paint_hi; p++) *p = PAINT;
  return JS_UNDEFINED;
}
static JSValue h_stack_used(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  if (!paint_lo) return JS_NULL;
  volatile uint8_t *p = paint_lo;
  while (p < paint_hi && *p == PAINT) p++;
  return JS_NewInt32(ctx, (int32_t)(stack_top - (uint8_t *)p));
}

static JSValue h_sha256(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  sha_t s; sha_init(&s);
  char hex[65];
  size_t n = 0;
  if (argc && JS_IsString(argv[0])) {
    const char *str = JS_ToCStringLen(ctx, &n, argv[0]);
    if (!str) return JS_EXCEPTION;
    sha_update(&s, (const uint8_t *)str, n);
    JS_FreeCString(ctx, str);
  } else {
    const uint8_t *p; size_t el;
    if (!argc || !typed_bytes(ctx, argv[0], &p, &n, &el)) return JS_ThrowTypeError(ctx, "sha256 takes a string or a typed array");
    sha_update(&s, p, n);
  }
  sha_hex(&s, hex);
  return JS_NewString(ctx, hex);
}
static JSValue h_utf8_length(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  size_t n = 0;
  const char *s = argc ? JS_ToCStringLen(ctx, &n, argv[0]) : NULL;
  if (!s) return JS_EXCEPTION;
  JS_FreeCString(ctx, s);
  return JS_NewFloat64(ctx, (double)n);
}

static JSValue h_text(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  const char *name = argc ? JS_ToCString(ctx, argv[0]) : NULL;
  if (!name) return JS_EXCEPTION;
  const cw_entry *e = bundle_find(2, name);
  JS_FreeCString(ctx, name);
  return e ? JS_NewStringLen(ctx, (const char *)e->data, e->len) : JS_NULL;
}
static JSValue h_list(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  const char *pre = argc ? JS_ToCString(ctx, argv[0]) : NULL;
  if (!pre) return JS_EXCEPTION;
  JSValue a = JS_NewArray(ctx);
  uint32_t k = 0;
  for (int i = 0; i < B.n; i++) if (B.e[i].kind == 2 && !strncmp(B.e[i].name, pre, strlen(pre))) JS_SetPropertyUint32(ctx, a, k++, JS_NewString(ctx, B.e[i].name));
  JS_FreeCString(ctx, pre);
  return a;
}

// Compile a script under a file name: Candela's scene files, so their stack frames name scene.js (world:shims.js).
static JSValue h_eval_script(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  size_t n = 0;
  const char *src = argc > 1 ? JS_ToCStringLen(ctx, &n, argv[0]) : NULL;
  const char *file = src ? JS_ToCString(ctx, argv[1]) : NULL;
  JSValue r = file ? JS_Eval(ctx, src, n, file, JS_EVAL_TYPE_GLOBAL) : JS_ThrowTypeError(ctx, "evalScript(source, file)");
  if (src) JS_FreeCString(ctx, src);
  if (file) JS_FreeCString(ctx, file);
  return r;
}

// A report line: "CW {json}" on the console once the segment has ended (a deferred effect: printing at 115,200
// baud would otherwise count against the turn, and a segment that crashes reports nothing).
static void run_report(deferred_t *d, vtime_t at) {
  (void)at;
  printf("CW %s\n", d->json);
  fflush(stdout);
  free(d->json); d->json = NULL;   // a run function owns what its effect carries (apply_deferred frees only d)
}
static JSValue h_report(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  JSValue j = argc ? JS_JSONStringify(ctx, argv[0], JS_UNDEFINED, JS_UNDEFINED) : JS_UNDEFINED;
  if (JS_IsException(j)) return j;
  const char *s = JS_ToCString(ctx, j);
  JS_FreeValue(ctx, j);
  if (!s) return JS_EXCEPTION;
  deferred_t *d = calloc(1, sizeof *d);
  d->run = run_report; d->json = xstrdup(s);
  JS_FreeCString(ctx, s);
  defer(d);
  return JS_UNDEFINED;
}

// ---- the renderer --------------------------------------------------------------------------------------------
static uint32_t generation;
static int render_owner = -1;

static const char *ARRAY_NAMES[CR_ARRAYS] = { "U", "O", "LI", "BV", "SDs", "SDd" };
// One cr_scene_t from { U, O, LI, BV, SDs, SDd: Float32Array, dynBase } (U holds the frame uniforms). Any typed
// array of 4-byte elements is taken as float bits; pack() makes Float32Arrays.
static cr_scene_t *scene_from(JSContext *ctx, JSValueConst b) {
  const uint8_t *p[CR_ARRAYS]; size_t n[CR_ARRAYS], el, total = 0;
  JSValue v[CR_ARRAYS];
  cr_scene_t *s = NULL;
  for (int i = 0; i < CR_ARRAYS; i++) v[i] = JS_GetPropertyStr(ctx, b, ARRAY_NAMES[i]);
  for (int i = 0; i < CR_ARRAYS; i++) {
    if (!typed_bytes(ctx, v[i], &p[i], &n[i], &el) || el != 4) { JS_ThrowTypeError(ctx, "buffers.%s must be a Float32Array", ARRAY_NAMES[i]); goto done; }
    if (n[i] % 16) { JS_ThrowRangeError(ctx, "buffers.%s is not a whole number of vec4 rows", ARRAY_NAMES[i]); goto done; }
    total += n[i];
  }
  int32_t dyn = 0;
  JSValue dv = JS_GetPropertyStr(ctx, b, "dynBase");
  if (JS_ToInt32(ctx, &dyn, dv) || dyn < 0) { JS_FreeValue(ctx, dv); JS_ThrowRangeError(ctx, "buffers.dynBase"); goto done; }
  JS_FreeValue(ctx, dv);
  s = malloc(sizeof *s + total);
  if (!s) { JS_ThrowOutOfMemory(ctx); goto done; }
  memset(s, 0, sizeof *s);
  s->magic = CR_SCENE_MAGIC; s->gen = ++generation; s->flags = CR_RESET; s->dyn_base = (uint32_t)dyn;
  s->bytes = (uint32_t)(sizeof *s + total);
  size_t at = 0;
  for (int i = 0; i < CR_ARRAYS; i++) {
    s->rows[i] = (uint32_t)(n[i] / 16); s->offset[i] = (uint32_t)(at / 4);
    if (n[i]) memcpy((uint8_t *)s->data + at, p[i], n[i]);
    at += n[i];
  }
  s->width = s->rows[CR_U] ? (uint32_t)s->data[0] : 0; s->height = s->rows[CR_U] ? (uint32_t)s->data[1] : 0;
done:
  for (int i = 0; i < CR_ARRAYS; i++) JS_FreeValue(ctx, v[i]);
  return s;
}

static void get_str(JSContext *ctx, JSValueConst o, const char *key, char *out, size_t n) {
  JSValue v = JS_GetPropertyStr(ctx, o, key);
  const char *s = JS_IsUndefined(v) || JS_IsNull(v) ? NULL : JS_ToCString(ctx, v);
  snprintf(out, n, "%s", s ? s : "");
  if (s) JS_FreeCString(ctx, s);
  JS_FreeValue(ctx, v);
}
static const char *get_text(JSContext *ctx, JSValueConst o, const char *key, size_t *len) {   // JS_FreeCString it
  JSValue v = JS_GetPropertyStr(ctx, o, key);
  const char *s = JS_IsString(v) ? JS_ToCStringLen(ctx, len, v) : NULL;
  if (!s) *len = 0;
  JS_FreeValue(ctx, v);
  return s;
}
static bool get_bool(JSContext *ctx, JSValueConst o, const char *key) { JSValue v = JS_GetPropertyStr(ctx, o, key); bool b = JS_ToBool(ctx, v) > 0; JS_FreeValue(ctx, v); return b; }

// The program in one malloc'd block (the struct, then the section texts and bytecode it points to), so free()
// releases all of it.
static cr_program_t *program_from(JSContext *ctx, JSValueConst prog, JSValueConst opts) {
  size_t fl, ml, n, el;
  const char *field = get_text(ctx, prog, "fieldCode", &fl), *mat = get_text(ctx, prog, "matCode", &ml);
  JSValue sec = JS_GetPropertyStr(ctx, prog, "sections");   // SECTIONS bytecode: a typed array, or null today
  const uint8_t *b;
  if (!typed_bytes(ctx, sec, &b, &n, &el)) n = 0;
  cr_program_t *p = calloc(1, sizeof *p + fl + 1 + ml + 1 + n);
  if (p) {
    char *at = (char *)(p + 1);
    p->field_wgsl = at; if (field) memcpy(at, field, fl); at[fl] = 0; p->field_len = fl; at += fl + 1;
    p->mat_wgsl = at; if (mat) memcpy(at, mat, ml); at[ml] = 0; p->mat_len = ml; at += ml + 1;
    if (n) { p->sections = (uint8_t *)at; memcpy(at, b, n); p->sections_len = n; }
  }
  if (field) JS_FreeCString(ctx, field);
  if (mat) JS_FreeCString(ctx, mat);
  JS_FreeValue(ctx, sec);
  if (!p) { JS_ThrowOutOfMemory(ctx); return NULL; }
  get_str(ctx, prog, "sceneId", p->scene_id, sizeof p->scene_id);
  get_str(ctx, prog, "fixedKernel", p->fixed_kernel_sha256, sizeof p->fixed_kernel_sha256);
  get_str(ctx, prog, "integrator", p->integrator, sizeof p->integrator);
  p->spectral = get_bool(ctx, prog, "spectral");
  JSValue post = JS_GetPropertyStr(ctx, opts, "post");
  if (JS_IsObject(post)) {
    get_str(ctx, post, "tonemap", p->tonemap, sizeof p->tonemap);
    get_str(ctx, post, "exposure", p->exposure, sizeof p->exposure);
    p->denoise = get_bool(ctx, post, "denoise");
    JSValue ev = JS_GetPropertyStr(ctx, post, "ev");
    double d;
    if (JS_IsNumber(ev) && !JS_ToFloat64(ctx, &d, ev)) { p->has_ev = true; p->ev = (float)d; }
    JS_FreeValue(ctx, ev);
  }
  JS_FreeValue(ctx, post);
  return p;
}

// start and update are deferred effects, like a world's messages: they take hold when the segment ends, and a
// segment that crashes starts nothing. What can be checked now is checked now (bad arguments throw).
static void run_start(deferred_t *d, vtime_t at) {
  (void)at;
  char why[160];
  cr_program_t *p = (cr_program_t *)d->json;   // a segment that crashes frees both blocks with free()
  cr_scene_t *s = (cr_scene_t *)d->bytes;
  d->json = NULL; d->bytes = NULL;
  int rc = d->op ? port_candela_start(d->w, p, s, why, sizeof why) : port_candela_update(d->w, s, why, sizeof why);
  if (rc) {
    klog("candela renderer refused %s: %s", d->op ? "a start" : "an update", why);
    if (d->op) cr_program_free(p);
    free(s);
  } else if (d->op) render_owner = d->w;
}
static JSValue h_render_start(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  if (argc < 3 || !JS_IsObject(argv[0]) || !JS_IsObject(argv[1])) return JS_ThrowTypeError(ctx, "render.start(program, buffers, options)");
  cr_scene_t *s = scene_from(ctx, argv[1]);
  if (!s) return JS_EXCEPTION;
  cr_program_t *p = program_from(ctx, argv[0], argv[2]);
  if (!p) { free(s); return JS_EXCEPTION; }
  deferred_t *d = calloc(1, sizeof *d);
  d->run = run_start; d->w = WORLD->id; d->op = 1; d->json = (char *)p; d->bytes = (uint8_t *)s;
  defer(d);
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "gen", JS_NewInt32(ctx, (int32_t)s->gen));
  JS_SetPropertyStr(ctx, o, "bytes", JS_NewInt32(ctx, (int32_t)s->bytes));
  return o;
}
static JSValue h_render_update(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  if (argc < 1 || !JS_IsObject(argv[0])) return JS_ThrowTypeError(ctx, "render.update(buffers, options)");
  cr_scene_t *s = scene_from(ctx, argv[0]);
  if (!s) return JS_EXCEPTION;
  deferred_t *d = calloc(1, sizeof *d);
  d->run = run_start; d->w = WORLD->id; d->op = 0; d->bytes = (uint8_t *)s;
  defer(d);
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "gen", JS_NewInt32(ctx, (int32_t)s->gen));
  JS_SetPropertyStr(ctx, o, "bytes", JS_NewInt32(ctx, (int32_t)s->bytes));
  return o;
}
static void run_stop(deferred_t *d, vtime_t at) { (void)at; port_candela_stop(d->w); if (render_owner == d->w) render_owner = -1; }
static JSValue h_render_stop(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  deferred_t *d = calloc(1, sizeof *d);
  d->run = run_stop; d->w = WORLD->id;
  defer(d);
  return JS_UNDEFINED;
}
static JSValue h_render_status(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  char *j = port_candela_status_json();
  if (!j) return JS_NULL;
  JSValue v = JS_ParseJSON(ctx, j, strlen(j), "<candela>");
  free(j);
  return v;
}

void candela_world_frame(int world, uint32_t gen, uint32_t pass, uint32_t spp, vtime_t pass_us) {
  world_t *W = world_by_id(world);
  if (!W || W->status == W_STOPPED || !W->vm) return;
  char j[128];
  snprintf(j, sizeof j, "{\"gen\":%u,\"pass\":%u,\"spp\":%u,\"us\":%lld}", (unsigned)gen, (unsigned)pass, (unsigned)spp, (long long)pass_us);
  defer_deliver(W, new_msg(M_ON, "candela.frame", j, -1));
}

// ---- install -------------------------------------------------------------------------------------------------
typedef struct { const char *name; JSCFunction *fn; int n; } fn_t;
static const fn_t HOST[] = {
  { "now", h_now, 0 }, { "segmentMs", h_segment_ms, 0 }, { "steps", h_steps, 0 }, { "mem", h_mem, 0 }, { "resetPeak", h_reset_peak, 0 },
  { "gc", h_gc, 0 }, { "longSegment", h_long_segment, 0 }, { "loaderStats", h_loader_stats, 0 }, { "stackPaint", h_stack_paint, 0 },
  { "stackUsed", h_stack_used, 0 }, { "sha256", h_sha256, 1 }, { "utf8Length", h_utf8_length, 1 }, { "text", h_text, 1 },
  { "list", h_list, 1 }, { "evalScript", h_eval_script, 2 }, { "report", h_report, 1 },
};
static const fn_t RENDER[] = {
  { "start", h_render_start, 3 }, { "update", h_render_update, 2 }, { "stop", h_render_stop, 0 }, { "status", h_render_status, 0 },
};

int candela_world_install(world_t *W, JSContext *ctx) {
  if (bundle_load()) { JS_ThrowInternalError(ctx, "%s", B.error); return -1; }
  stack_top = __builtin_frame_address(0);
  JS_SetModuleLoaderFunc(JS_GetRuntime(ctx), cw_normalize, cw_load, W);
  JSValue g = JS_GetGlobalObject(ctx), h = JS_NewObject(ctx), r = JS_NewObject(ctx);
  for (size_t i = 0; i < sizeof HOST / sizeof *HOST; i++) JS_SetPropertyStr(ctx, h, HOST[i].name, JS_NewCFunction(ctx, HOST[i].fn, HOST[i].name, HOST[i].n));
  for (size_t i = 0; i < sizeof RENDER / sizeof *RENDER; i++) JS_SetPropertyStr(ctx, r, RENDER[i].name, JS_NewCFunction(ctx, RENDER[i].fn, RENDER[i].name, RENDER[i].n));
  JS_SetPropertyStr(ctx, h, "render", r);
  JS_SetPropertyStr(ctx, h, "bundleBytes", JS_NewFloat64(ctx, (double)B.len));
  JS_SetPropertyStr(ctx, g, "__candela", h);
  JS_FreeValue(ctx, g);
  return 0;
}

void candela_world_dispose(world_t *W) {
  if (render_owner == W->id) { port_candela_stop(W->id); render_owner = -1; }
}
