// candela_gallery.c: the progressive renderer core (candela_gallery.h). Plain C99 with libm; no ESP-IDF.
// Compile with -ffp-contract=off (as the kernel instance), so the device and the host round alike.
#include "candela_gallery.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>

// Pass 0's sub-passes: offsets inside a 4 x 4 cell. After the first, one pixel per cell is sampled; after the
// fourth, every pixel with even coordinates (one per 2 x 2 cell); after the sixteenth, every pixel.
static const uint8_t SUB[CG_SUBPASSES][2] = {
  {0, 0}, {2, 2}, {2, 0}, {0, 2},
  {1, 1}, {3, 3}, {3, 1}, {1, 3}, {1, 0}, {3, 2}, {3, 0}, {1, 2}, {0, 1}, {2, 3}, {2, 1}, {0, 3},
};

uint32_t cg_fnv(uint32_t h, const void *p, size_t n) {
  const uint8_t *b = p;
  while (n--) h = (h ^ *b++) * 16777619u;
  return h;
}

unsigned cg_frame_index(unsigned pass) { return pass == 0 ? 0 : pass + 1; }

static void fail(char *err, size_t n, const char *what) {
  if (err && n) { strncpy(err, what, n - 1); err[n - 1] = 0; }
}

void cg_end(cg_state *s) {
  if (!s->alloc.release) return;
  s->alloc.release(s->rows); s->alloc.release(s->acc); s->alloc.release(s->regs);
  s->rows = NULL; s->acc = NULL; s->regs = NULL; s->scene = NULL;
}

void cg_free_all(cg_state *s) {
  cg_end(s);
  if (s->alloc.release) s->alloc.release(s->sky);
  s->sky = NULL; s->sky_inst = NULL;
}

int cg_begin(cg_state *s, const cg_scene_desc *d, const cg_instance *inst, const cg_alloc *a, char *err, size_t n) {
  cg_end(s);
  s->alloc = *a;
  if (!d || !inst) { fail(err, n, "no scene or kernel instance"); return 1; }
  if (!!d->spectral != !!inst->spectral) { fail(err, n, "the scene and the kernel instance differ in spectral mode"); return 1; }
  if (d->w > CG_MAX_SIDE || d->h > CG_MAX_SIDE || d->w % 4 || d->h % 4) { fail(err, n, "scene size"); return 1; }
  s->scene = d; s->inst = inst; s->w = d->w; s->h = d->h;
  size_t words = 0;
  for (int k = 0; k < 5; k++) words += 4u * d->rows[k];
  s->rows = a->big(words * 4);
  s->acc = a->big((size_t)s->w * s->h * 16);
  if (!s->rows || !s->acc) { fail(err, n, "out of memory for the scene"); cg_end(s); return 1; }
  memcpy(s->rows, d->data, words * 4);
  memset(s->acc, 0, (size_t)s->w * s->h * 16);
  const float *p = s->rows;
  s->b.nU = d->rows[0]; s->b.nO = d->rows[1]; s->b.nLI = d->rows[2]; s->b.nBV = d->rows[3]; s->b.nSD = d->rows[4];
  s->b.U = p; p += 4 * d->rows[0]; s->b.O = p; p += 4 * d->rows[1]; s->b.LI = p; p += 4 * d->rows[2];
  s->b.BV = p; p += 4 * d->rows[3]; s->b.SD = p;
  if ((int)s->b.U[0] != s->w || (int)s->b.U[1] != s->h) { fail(err, n, "frame uniforms do not match the scene size"); cg_end(s); return 1; }
  const unsigned sky = inst->sky_bytes();
  if (sky && s->sky_inst != inst) {
    if (s->alloc.release) s->alloc.release(s->sky);
    s->sky = a->big(sky);
    s->sky_inst = s->sky ? inst : NULL;
    if (!s->sky) { fail(err, n, "out of memory for the sky table"); cg_end(s); return 1; }
    memset(s->sky, 0, sky);   // tag 0: the first bind builds the table
  }
  if (inst->begin && inst->begin(d, &s->b, err, n)) { cg_end(s); return 1; }
  s->bound = inst->bind(&s->b, inst->sections_vm, sky ? s->sky : NULL);
  if (!s->bound) { fail(err, n, "the kernel refused the buffers"); cg_end(s); return 1; }
  if (!inst->vm_load) goto ready;   // the instance's sections are its own code
  if (d->prog_len < 16 || memcmp(d->prog, "CDVM", 4)) { fail(err, n, "no section bytecode"); cg_end(s); return 1; }
  const unsigned nregs = d->prog[8] | d->prog[9] << 8;
  s->regs_bytes = 4u * (nregs ? nregs : 1);
  s->regs = a->fast(s->regs_bytes);
  if (!s->regs) { fail(err, n, "out of memory for the interpreter's registers"); cg_end(s); return 1; }
  if (inst->vm_load(d->prog, d->prog_len, s->b.U, s->b.nU, s->regs, s->regs_bytes, err, n)) { cg_end(s); return 1; }
ready:
  s->pass = 0; s->sub = 0; s->row = 0; s->samples = 0; s->metered = 0;
  s->ev = d->exposure ? d->ev : 12.0;   // src/viewport.js: this.ev = 12 until the meter has read the image
  return 0;
}

static inline void add(float *acc, const cdl_pixout *o) {
  acc[0] += o->c[0]; acc[1] += o->c[1]; acc[2] += o->c[2]; acc[3] += o->c[3];
}

int cg_step(cg_state *s) {
  const unsigned f = cg_frame_index(s->pass);
  cdl_pixout line[CG_MAX_SIDE];
  if (s->pass == 0) {
    const int ox = SUB[s->sub][0], oy = SUB[s->sub][1], y = 4 * s->row + oy;
    for (int x = ox; x < s->w; x += 4) {
      s->inst->render_span(y, x, x + 1, f, line);
      add(s->acc + 4 * (y * s->w + x), line);
    }
    s->samples += (unsigned)(s->w / 4);
    if (++s->row < s->h / 4) return 0;
    s->row = 0;
    s->sub++;
    if (s->sub == 1) return CG_EV_COARSE;
    if (s->sub == 4) return CG_EV_HALF;
    if (s->sub < CG_SUBPASSES) return 0;
    s->pass = 1;
    return CG_EV_PASS;
  }
  s->inst->render_span(s->row, 0, s->w, f, line);
  float *a = s->acc + 4 * s->row * s->w;
  for (int x = 0; x < s->w; x++) add(a + 4 * x, line + x);
  s->samples += (unsigned)s->w;
  if (++s->row < s->h) return 0;
  s->row = 0;
  s->pass++;
  return CG_EV_PASS;
}

int cg_advance(cg_state *s) {
  const int ev = cg_step(s);
  if (s->scene->exposure == 0 &&
      (ev == CG_EV_COARSE || (ev == CG_EV_PASS && (s->pass == 2 || s->pass == 8 || s->pass == 32))))
    cg_meter(s);
  return ev;
}

// ---- exposure: src/viewport.js meter(), in double precision as JavaScript computes it ----
typedef struct { double L, wgt; } block_mean;
static int cmp_double(const void *a, const void *b) {
  const double x = *(const double *)a, y = *(const double *)b;
  return x < y ? -1 : x > y;
}
void cg_meter(cg_state *s) {
  enum { BX = 48, BY = 32 };
  const int w = s->w, h = s->h;
  const double bw = (double)w / BX, bh = (double)h / BY;
  block_mean *means = s->alloc.big(sizeof(block_mean) * BX * BY);
  double *sorted = s->alloc.big(sizeof(double) * BX * BY);
  if (!means || !sorted) { s->alloc.release(means); s->alloc.release(sorted); return; }
  int nm = 0;
  for (int by = 0; by < BY; by++) for (int bx = 0; bx < BX; bx++) {
    double sum = 0; int cnt = 0;
    const int x0 = (int)floor(bx * bw), y0 = (int)floor(by * bh);
    int x1 = (int)floor((bx + 1) * bw), y1 = (int)floor((by + 1) * bh);
    if (x1 < x0 + 1) x1 = x0 + 1;
    if (y1 < y0 + 1) y1 = y0 + 1;
    int sx = (x1 - x0) >> 2, sy = (y1 - y0) >> 2;
    if (sx < 1) sx = 1;
    if (sy < 1) sy = 1;
    for (int y = y0; y < y1 && y < h; y += sy) for (int x = x0; x < x1 && x < w; x += sx) {
      const float *f = s->acc + 4 * (y * w + x);
      if (!(f[3] > 0)) continue;   // a pixel pass 0 has not sampled yet (Candela meters only complete frames)
      const double L = (0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]) / f[3];
      if (isfinite(L)) { sum += L; cnt++; }
    }
    if (!cnt) continue;
    const double cx = (bx + 0.5) / BX - 0.5, cy = (by + 0.5) / BY - 0.5, wgt = 1 + exp(-(cx * cx + cy * cy) * 8);
    means[nm].L = sum / cnt; means[nm].wgt = wgt; sorted[nm] = means[nm].L; nm++;
  }
  qsort(sorted, (size_t)nm, sizeof(double), cmp_double);
  const double L90 = nm ? sorted[(int)floor(nm * 0.9)] : 0, lo = fmax(L90 * 1e-4, 1e-7);
  double sl = 0, sw = 0;
  for (int i = 0; i < nm; i++) {
    if (means[i].L < lo && L90 > 0) continue;
    sl += log(fmax(means[i].L, 1e-4)) * means[i].wgt; sw += means[i].wgt;
  }
  const double Lavg = exp(sl / fmax(sw, 1));
  double ev = log2(fmax(Lavg, 1e-4) * 100 / 12.5);
  if (nm > 16) {
    const double L98 = sorted[(int)floor(nm * 0.98)], evH = log2(fmax(L98, 1e-6) / (1.2 * 3));
    if (evH > ev) ev = fmin(evH, ev + 4);
  }
  if (isfinite(ev)) { s->ev = ev; s->metered++; }
  s->alloc.release(means); s->alloc.release(sorted);
}

void cg_display_uniforms(cg_state *s) {
  const cg_scene_desc *d = s->scene;
  memset(s->D, 0, sizeof s->D);
  s->D[0] = (float)s->w; s->D[1] = (float)s->h; s->D[2] = (float)(s->pass > 1 ? s->pass : 1);
  s->D[3] = (float)(1.0 / (1.2 * pow(2.0, s->ev)));
  s->D[4] = d->tonemap; s->D[5] = d->false_color; s->D[6] = 0; s->D[7] = 0;
  s->D[8] = d->vignette; s->D[9] = d->grain; s->D[10] = d->bloom; s->D[11] = 0;
  s->D[12] = d->tan_h; s->D[13] = (float)((double)d->tan_h * s->h / s->w);
}

// ---- the display pass ----
static uint8_t OUT8[4096];   // srgbEnc(clamp(pow(o, 2.2), 0, 1)) * 255, for o = i / 4095
static int out8_ready;
static float srgb1(float c) { return c <= 0.0031308f ? c * 12.92f : 1.055f * powf(fmaxf(c, 0.0f), 0.4166667f) - 0.055f; }
static uint8_t to8(float v) { v = v < 0 ? 0 : v > 1 ? 1 : v; return (uint8_t)(v * 255.0f + 0.5f); }
static void out8_init(void) {
  for (int i = 0; i < 4096; i++) {
    const float o = (float)i / 4095.0f, t = powf(o, 2.2f);
    OUT8[i] = to8(srgb1(fminf(fmaxf(t, 0.0f), 1.0f)));
  }
  out8_ready = 1;
}
static inline uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
  return (uint16_t)(((r * 31 + 127) / 255) << 11 | ((g * 63 + 127) / 255) << 5 | ((b * 31 + 127) / 255));
}
static inline float agx_curve(float x) {   // cdl_post.cpp agxCurve, per component, same operation order
  const float x2 = x * x, x4 = x2 * x2;
  return 15.5f * x4 * x2 - 40.14f * x4 * x + 31.96f * x4 - 6.868f * x2 * x + 0.4298f * x2 + 0.1191f * x - 0.00232f;
}
static inline float clamp01(float v) { return fminf(fmaxf(v, 0.0f), 1.0f); }
static inline uint8_t out8(float o) { return OUT8[(int)(clamp01(o) * 4095.0f + 0.5f)]; }
// cdl_post.cpp tmAgx up to its final power; that power and srgbEnc are the table.
static uint16_t agx565(const float *c4, float ex) {
  const float k = 1.0f / fmaxf(c4[3], 1.0f);
  const float cx = fmaxf(c4[0] * k * ex, 1e-10f), cy = fmaxf(c4[1] * k * ex, 1e-10f), cz = fmaxf(c4[2] * k * ex, 1e-10f);
  const float mx = 0.842479062253094f * cx + 0.0784335999999992f * cy + 0.0792237451477643f * cz;
  const float my = 0.0423282422610123f * cx + 0.878468636469772f * cy + 0.0791661274605434f * cz;
  const float mz = 0.0423756549057051f * cx + 0.0784336f * cy + 0.879142973793104f * cz;
  const float vx = agx_curve(clamp01((log2f(mx) + 12.47393f) / 16.5f));
  const float vy = agx_curve(clamp01((log2f(my) + 12.47393f) / 16.5f));
  const float vz = agx_curve(clamp01((log2f(mz) + 12.47393f) / 16.5f));
  const float ox = 1.19687900512017f * vx - 0.0980208811401368f * vy - 0.0990297440797205f * vz;
  const float oy = -0.0528968517574562f * vx + 1.15190312990417f * vy - 0.0989611768448433f * vz;
  const float oz = -0.0529716355144438f * vx - 0.0980434501171241f * vy + 1.15107367264116f * vz;
  return rgb565(out8(ox), out8(oy), out8(oz));
}

void cg_display(cg_state *s, uint16_t *out, int mode) {
  const int w = s->w, h = s->h;
  cg_display_uniforms(s);
  const cg_scene_desc *d = s->scene;
  const int simple = d->tonemap == 0 && !d->false_color && d->vignette == 0 && d->grain == 0 && d->bloom == 0;
  if (mode == CG_EXACT || !simple) {
    s->inst->post_bind(s->acc, s->acc, s->acc, s->D);   // view 0 reads only the colour; albedo and normal unused
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      float o[4];
      s->inst->display_px(x, y, o);
      out[y * w + x] = rgb565(to8(o[0]), to8(o[1]), to8(o[2]));
    }
    return;
  }
  if (!out8_ready) out8_init();
  const float ex = s->D[3];
  const int mask = s->pass > 0 ? ~0 : s->sub >= 4 ? ~1 : ~3;   // the cell whose first pixel stands in for the rest
  for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
    const float *c = s->acc + 4 * (y * w + x);
    if (!(c[3] > 0)) c = s->acc + 4 * ((y & mask) * w + (x & mask));
    out[y * w + x] = agx565(c, ex);
  }
}

void cg_upscale320(const uint16_t *in, int w, int h, uint16_t *out) {
  enum { S = 320 };
  int xi[S], xf[S];
  for (int X = 0; X < S; X++) {   // source coordinate of the output pixel's centre, in 1/256 pixel
    int u = ((2 * X + 1) * w * 128) / S - 128;
    if (u < 0) u = 0;
    if (u > (w - 1) * 256) u = (w - 1) * 256;
    xi[X] = u >> 8; xf[X] = u & 255;
  }
  for (int Y = 0; Y < S; Y++) {
    int v = ((2 * Y + 1) * h * 128) / S - 128;
    if (v < 0) v = 0;
    if (v > (h - 1) * 256) v = (h - 1) * 256;
    const int y0 = v >> 8, y1 = y0 + 1 < h ? y0 + 1 : y0, fy = v & 255;
    const uint16_t *r0 = in + y0 * w, *r1 = in + y1 * w;
    uint16_t *o = out + Y * S;
    for (int X = 0; X < S; X++) {
      const int x0 = xi[X], x1 = x0 + 1 < w ? x0 + 1 : x0, fx = xf[X];
      const unsigned a = r0[x0], b = r0[x1], c = r1[x0], e = r1[x1];
      const int w00 = (256 - fx) * (256 - fy), w10 = fx * (256 - fy), w01 = (256 - fx) * fy, w11 = fx * fy;
      const unsigned R = ((a >> 11) * w00 + (b >> 11) * w10 + (c >> 11) * w01 + (e >> 11) * w11 + 32768) >> 16;
      const unsigned G = (((a >> 5) & 63) * w00 + ((b >> 5) & 63) * w10 + ((c >> 5) & 63) * w01 + ((e >> 5) & 63) * w11 + 32768) >> 16;
      const unsigned B = ((a & 31) * w00 + (b & 31) * w10 + (c & 31) * w01 + (e & 31) * w11 + 32768) >> 16;
      o[X] = (uint16_t)(R << 11 | G << 5 | B);
    }
  }
}

// ---- digests ----
uint32_t cg_frame0_digest(cg_state *s, cdl_pixout *scratch, double *mean_lum) {
  uint32_t hsh = 2166136261u;
  double lum = 0;
  for (int y = 0; y < s->h; y++) {
    s->inst->render_span(y, 0, s->w, 0, scratch);
    for (int x = 0; x < s->w; x++) {
      hsh = cg_fnv(hsh, &scratch[x], sizeof scratch[x]);
      lum += 0.2126f * scratch[x].c[0] + 0.7152f * scratch[x].c[1] + 0.0722f * scratch[x].c[2];
    }
  }
  if (mean_lum) *mean_lum = lum / (s->w * s->h);
  return hsh;
}

double cg_mean_lum(const cg_state *s) {
  double lum = 0;
  for (int i = 0; i < s->w * s->h; i++) {
    const float *c = s->acc + 4 * i;
    if (c[3] > 0) lum += (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / c[3];
  }
  return lum / (s->w * s->h);
}

uint32_t cg_acc_digest(const cg_state *s, double *mean_lum) {
  if (mean_lum) *mean_lum = cg_mean_lum(s);
  return cg_fnv(2166136261u, s->acc, (size_t)s->w * s->h * 16);
}
