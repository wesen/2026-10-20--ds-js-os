/* bench.c: Candela's generated kernel on the ESP32-P4 (PICOCALC-CANDELA-CPU-KERNEL).
 *
 * A standalone factory app. It links every measurement arm (registry.c, libcdl.a from 04-build.py) and
 * runs on core 0 with the task watchdog off. CDL_BENCH_MODE selects what one run does:
 *   1  timing: microbenchmarks; three blocks of 1 spp frames of every arm and scene (arm order rotated per
 *      block) with mcycle around each row's render_span and the L1/L2 cache counters around the frame;
 *      the post pass (display, one a-trous iteration) per arm; scene buffers in PSRAM against internal RAM;
 *      a minstret probe last (it may trap).
 *   2  images: the cpu arm renders B-01, R-01, L-03, G-01 and E-02 at 64 spp (frame indices 0..63) and sends
 *      each pixel's f32 luminance and an RGBE preview as base64 rows.
 * Each line of output starts with a CK tag; 10-score-board.py parses them. A frame digest is FNV-1a over the
 * 48 bytes of every pixel's cdl_pixout, exactly as 06-driver.c computes it in the counting interpreter. */
#include <inttypes.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "esp_cpu.h"
#include "esp_heap_caps.h"
#include "esp_private/esp_clk.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "soc/soc.h"
#include "soc/cache_reg.h"
#include "registry.h"
#include "mode.h"          /* CDL_BENCH_MODE, written by 07-stage-board.sh */

#ifndef CDL_BENCH_MODE
#define CDL_BENCH_MODE 1
#endif
#define BLOCKS 3
extern void cdl_microbench(void);

typedef struct { cdl_buffers b; uint8_t *mem; int w, h; } scene_t;
static scene_t scenes[16], scenesPsram[16];
static void *sky;
static unsigned skyBytes;
static cdl_pixout row[160];

static uint32_t fnv(uint32_t h, const void *p, unsigned n) { const uint8_t *b = p; while (n--) h = (h ^ *b++) * 16777619u; return h; }
static int load(const cdl_scene_t *s, scene_t *o, uint32_t caps) {
  const size_t n = s->end - s->blob;
  o->mem = heap_caps_aligned_alloc(16, n, caps);
  if (!o->mem) return 0;
  memcpy(o->mem, s->blob, n);
  const uint32_t *w = (const uint32_t *)o->mem, *c = w + 1;
  const float *p = (const float *)(w + 6);
  o->b.nU = c[0]; o->b.nO = c[1]; o->b.nLI = c[2]; o->b.nBV = c[3]; o->b.nSD = c[4];
  o->b.U = p; p += 4 * c[0]; o->b.O = p; p += 4 * c[1]; o->b.LI = p; p += 4 * c[2]; o->b.BV = p; p += 4 * c[3]; o->b.SD = p;
  o->w = (int)o->b.U[0]; o->h = (int)o->b.U[1];
  return w[0] == 0x314c4443u && o->w == s->w && o->h == s->h;
}
static const cdl_arm_t *arm(const char *name, int scene) {
  for (int k = 0; k < CDL_NARMS; k++) if (CDL_ARMS[k].sceneIx == scene && !strcmp(CDL_ARMS[k].arm, name)) return &CDL_ARMS[k];
  return NULL;
}

/* ---- the cache access counters (soc/cache_reg.h): L1 per bus, L2 per bus ---- */
static const uint32_t L1EN = CACHE_L1_IBUS0_CNT_ENA | CACHE_L1_IBUS1_CNT_ENA | CACHE_L1_DBUS0_CNT_ENA | CACHE_L1_DBUS1_CNT_ENA;
static const uint32_t L1CL = CACHE_L1_IBUS0_CNT_CLR | CACHE_L1_IBUS1_CNT_CLR | CACHE_L1_DBUS0_CNT_CLR | CACHE_L1_DBUS1_CNT_CLR;
static const uint32_t L2EN = CACHE_L2_IBUS0_CNT_ENA | CACHE_L2_IBUS1_CNT_ENA | CACHE_L2_DBUS0_CNT_ENA | CACHE_L2_DBUS1_CNT_ENA;
static const uint32_t L2CL = CACHE_L2_IBUS0_CNT_CLR | CACHE_L2_IBUS1_CNT_CLR | CACHE_L2_DBUS0_CNT_CLR | CACHE_L2_DBUS1_CNT_CLR;
static void cc_start(void) {
  REG_WRITE(CACHE_L1_CACHE_ACS_CNT_CTRL_REG, L1EN | L1CL); REG_WRITE(CACHE_L1_CACHE_ACS_CNT_CTRL_REG, L1EN);
  REG_WRITE(CACHE_L2_CACHE_ACS_CNT_CTRL_REG, L2EN | L2CL); REG_WRITE(CACHE_L2_CACHE_ACS_CNT_CTRL_REG, L2EN);
}
static void cc_read(uint32_t *v) {
  static const uint32_t R[16] = {CACHE_L1_IBUS0_ACS_HIT_CNT_REG, CACHE_L1_IBUS0_ACS_MISS_CNT_REG, CACHE_L1_IBUS1_ACS_HIT_CNT_REG, CACHE_L1_IBUS1_ACS_MISS_CNT_REG,
    CACHE_L1_DBUS0_ACS_HIT_CNT_REG, CACHE_L1_DBUS0_ACS_MISS_CNT_REG, CACHE_L1_DBUS1_ACS_HIT_CNT_REG, CACHE_L1_DBUS1_ACS_MISS_CNT_REG,
    CACHE_L2_IBUS0_ACS_HIT_CNT_REG, CACHE_L2_IBUS0_ACS_MISS_CNT_REG, CACHE_L2_IBUS1_ACS_HIT_CNT_REG, CACHE_L2_IBUS1_ACS_MISS_CNT_REG,
    CACHE_L2_DBUS0_ACS_HIT_CNT_REG, CACHE_L2_DBUS0_ACS_MISS_CNT_REG, CACHE_L2_DBUS1_ACS_HIT_CNT_REG, CACHE_L2_DBUS1_ACS_MISS_CNT_REG};
  for (int k = 0; k < 16; k++) v[k] = REG_READ(R[k]);
}

/* One 1 spp frame (frame index 0): bind, then render_span per row with mcycle around the call only. */
static void frame(const char *stage, const cdl_arm_t *a, const scene_t *s, int block, int cold) {
  uint32_t t0 = esp_cpu_get_cycle_count();
  const int bound = a->bind(&s->b, a->sections, sky);
  const uint32_t bindCycles = esp_cpu_get_cycle_count() - t0;
  uint64_t cycles = 0; uint32_t h = 2166136261u, cc[16]; double lum = 0;
  cc_start();
  for (int y = 0; y < s->h; y++) {
    const uint32_t r0 = esp_cpu_get_cycle_count();
    a->render_span(y, 0, s->w, 0, row);
    cycles += esp_cpu_get_cycle_count() - r0;
    float l = 0;
    for (int x = 0; x < s->w; x++) { h = fnv(h, &row[x], sizeof row[x]); l += 0.2126f * row[x].c[0] + 0.7152f * row[x].c[1] + 0.0722f * row[x].c[2]; }
    lum += l;
  }
  cc_read(cc);
  printf("CKFRAME %s %s %s %d %d %d %" PRIu32 " %" PRIu64 " %08" PRIx32 " %.6e", stage, a->arm, CDL_SCENES[a->sceneIx].id, block, cold, bound, bindCycles,
         cycles, h, lum / (s->w * s->h));
  for (int k = 0; k < 16; k++) printf(" %" PRIu32, cc[k]);
  printf("\n");
}

static void info(void) {
  printf("CKINFO cpu_hz %" PRIu32 " arms %d scenes %d instances %d free_internal %u free_psram %u\n", (uint32_t)esp_clk_cpu_freq(), CDL_NARM_NAMES,
         CDL_NSCENES, CDL_NARMS, (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL), (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
  for (int k = 0; k < CDL_NARMS; k++) if (CDL_ARMS[k].sceneIx == 0)
    printf("CKARM %s render_span %p sky_bytes %u post %d\n", CDL_ARMS[k].arm, (void *)CDL_ARMS[k].render_span, CDL_ARMS[k].sky_bytes(), CDL_ARMS[k].post_bind != NULL);
  for (int j = 0; j < CDL_NSCENES; j++) printf("CKSCENE %s %d %d %u\n", CDL_SCENES[j].id, CDL_SCENES[j].w, CDL_SCENES[j].h, (unsigned)(CDL_SCENES[j].end - CDL_SCENES[j].blob));
}

#if CDL_BENCH_MODE == 1
static void timing(void) {
  /* frames: every arm and scene, three blocks, the arm order rotated by a third of the arms per block */
  static uint8_t seen[64][16];
  for (int b = 0; b < BLOCKS; b++)
    for (int j = 0; j < CDL_NSCENES; j++)
      for (int k = 0; k < CDL_NARM_NAMES; k++) {
        const int ai = (k + b * (CDL_NARM_NAMES / BLOCKS)) % CDL_NARM_NAMES;
        const cdl_arm_t *a = &CDL_ARMS[ai * CDL_NSCENES + j];
        frame("time", a, &scenes[j], b, !seen[ai][j]);
        seen[ai][j] = 1;
        vTaskDelay(1);
      }
  /* placement: the cpu arm with the scene buffers in PSRAM (B-01, R-01), interleaved with internal RAM */
  for (int b = 0; b < 2; b++) for (int j = 0; j < 2; j++) {
    const cdl_arm_t *a = arm("cpu", j);
    if (!a) break;
    frame("internal", a, &scenes[j], b, 0); vTaskDelay(1);
    frame("psram", a, &scenesPsram[j], b, 0); vTaskDelay(1);
  }
  /* post: inputs from one cpu-arm B-01 frame, kept in PSRAM like the firmware's accumulation buffers */
  const scene_t *s = &scenes[0];
  const int W = s->w, H = s->h, N = W * H;
  float *src = heap_caps_malloc(16 * N, MALLOC_CAP_SPIRAM), *alb = heap_caps_malloc(16 * N, MALLOC_CAP_SPIRAM), *nrm = heap_caps_malloc(16 * N, MALLOC_CAP_SPIRAM);
  const cdl_arm_t *c = arm("cpu", 0);
  if (!src || !alb || !nrm || !c) { printf("CKERROR post allocation\n"); return; }
  c->bind(&s->b, c->sections, sky);
  double lum = 0;
  for (int y = 0; y < H; y++) {
    c->render_span(y, 0, W, 0, row);
    for (int x = 0; x < W; x++) { const int i = y * W + x; memcpy(src + 4 * i, row[x].c, 16); memcpy(alb + 4 * i, row[x].alb, 16); memcpy(nrm + 4 * i, row[x].nrm, 16);
      lum += 0.2126f * row[x].c[0] + 0.7152f * row[x].c[1] + 0.0722f * row[x].c[2]; }
  }
  static float D[4 * 8];
  memset(D, 0, sizeof D);
  D[0] = W; D[1] = H; D[2] = 1; D[3] = (float)(0.18 / (lum / N));   /* exposure: mean luminance to 0.18 */
  D[16] = 1; D[17] = 0.5f;                                            /* a-trous step 1, colour sigma 0.5 */
  for (int b = 0; b < 2; b++)
    for (int k = 0; k < CDL_NARM_NAMES; k++) {
      const cdl_arm_t *a = &CDL_ARMS[k * CDL_NSCENES];
      if (!a->post_bind) continue;
      a->post_bind(src, alb, nrm, D);
      float o[4]; uint32_t hd = 2166136261u, hn = 2166136261u;
      uint64_t cd = 0, cn = 0;
      for (int y = 0; y < H; y++) {
        uint32_t t = esp_cpu_get_cycle_count();
        for (int x = 0; x < W; x++) { a->display(x, y, o); hd = fnv(hd, o, 16); }
        cd += esp_cpu_get_cycle_count() - t;
        t = esp_cpu_get_cycle_count();
        for (int x = 0; x < W; x++) { a->denoise(x, y, o); hn = fnv(hn, o, 12); }
        cn += esp_cpu_get_cycle_count() - t;
      }
      printf("CKPOST %s %d %d %" PRIu64 " %" PRIu64 " %08" PRIx32 " %08" PRIx32 "\n", a->arm, b, N, cd, cn, hd, hn);
      vTaskDelay(1);
    }
}
static void probe_minstret(void) {
  printf("CKPROBE minstret\n");
  vTaskDelay(pdMS_TO_TICKS(50));
  uint32_t i0, i1, c0, c1, k = 0;
  c0 = esp_cpu_get_cycle_count();
  asm volatile("csrr %0, minstret" : "=r"(i0));
  asm volatile(".rept 1000\naddi %0, %0, 1\n.endr" : "+r"(k));
  asm volatile("csrr %0, minstret" : "=r"(i1));
  c1 = esp_cpu_get_cycle_count();
  printf("CKMINSTRET %" PRIu32 " %" PRIu32 " %" PRIu32 "\n", i1 - i0, c1 - c0, k);
}
#endif

#if CDL_BENCH_MODE == 2
static const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static void b64(const uint8_t *p, int n, char *o) {
  int i = 0, j = 0;
  for (; i + 2 < n; i += 3) { const uint32_t v = p[i] << 16 | p[i + 1] << 8 | p[i + 2]; o[j++] = B64[v >> 18]; o[j++] = B64[(v >> 12) & 63]; o[j++] = B64[(v >> 6) & 63]; o[j++] = B64[v & 63]; }
  if (i < n) { const uint32_t v = p[i] << 16 | (i + 1 < n ? p[i + 1] << 8 : 0); o[j++] = B64[v >> 18]; o[j++] = B64[(v >> 12) & 63]; o[j++] = i + 1 < n ? B64[(v >> 6) & 63] : '='; o[j++] = '='; }
  o[j] = 0;
}
static void rgbe(const float *c, uint8_t *o) {   /* Ward's shared-exponent preview encoding */
  float m = c[0] > c[1] ? c[0] : c[1]; if (c[2] > m) m = c[2];
  if (!(m > 1e-32f)) { o[0] = o[1] = o[2] = o[3] = 0; return; }
  int e; const float f = frexpf(m, &e) * 256.0f / m;
  for (int k = 0; k < 3; k++) { const float v = c[k] * f; o[k] = v <= 0 ? 0 : v >= 255 ? 255 : (uint8_t)v; }
  o[3] = (uint8_t)(e + 128);
}
static void images(void) {
  static const char *ids[] = {"B-01", "R-01", "L-03", "G-01", "E-02"};
  const int SPP = 64;
  float *acc = heap_caps_malloc(160 * 160 * 4 * sizeof(float), MALLOC_CAP_SPIRAM);
  static uint8_t px[160 * 8];
  static char line[160 * 8 * 4 / 3 + 8];
  if (!acc) { printf("CKERROR image allocation\n"); return; }
  for (unsigned q = 0; q < sizeof ids / sizeof ids[0]; q++) {
    int j = -1; for (int k = 0; k < CDL_NSCENES; k++) if (!strcmp(CDL_SCENES[k].id, ids[q])) j = k;
    const cdl_arm_t *a = j >= 0 ? arm("cpu", j) : NULL;
    if (!a) { printf("CKERROR no cpu arm for %s\n", ids[q]); continue; }
    const scene_t *s = &scenes[j];
    const int W = s->w, H = s->h;
    memset(acc, 0, (size_t)W * H * 16);
    a->bind(&s->b, a->sections, sky);
    uint64_t cycles = 0;
    for (int f = 0; f < SPP; f++) {
      for (int y = 0; y < H; y++) {
        const uint32_t t = esp_cpu_get_cycle_count();
        a->render_span(y, 0, W, (unsigned)f, row);
        cycles += esp_cpu_get_cycle_count() - t;
        float *r = acc + 4 * y * W;
        for (int x = 0; x < W; x++) for (int k = 0; k < 4; k++) r[4 * x + k] += row[x].c[k];
      }
      vTaskDelay(1);
    }
    double lum = 0;
    for (int i = 0; i < W * H; i++) lum += 0.2126f * (acc[4 * i] / SPP) + 0.7152f * (acc[4 * i + 1] / SPP) + 0.0722f * (acc[4 * i + 2] / SPP);
    printf("CKIMG %s %d %d %d %" PRIu64 " %.9e\n", ids[q], W, H, SPP, cycles, lum / (W * H));
    for (int y = 0; y < H; y++) {
      for (int x = 0; x < W; x++) {
        const float *c = acc + 4 * (y * W + x);
        const float m[3] = {c[0] / SPP, c[1] / SPP, c[2] / SPP};
        const float l = 0.2126f * m[0] + 0.7152f * m[1] + 0.0722f * m[2];
        memcpy(px + 8 * x, &l, 4); rgbe(m, px + 8 * x + 4);
      }
      b64(px, 8 * W, line);
      printf("CKPX %d %s\n", y, line);
    }
    printf("CKIMGEND %s\n", ids[q]);
  }
}
#endif

void app_main(void) {
  vTaskDelay(pdMS_TO_TICKS(1500));
  printf("CANDELA BEGIN mode %d\n", CDL_BENCH_MODE);
  info();
  for (int k = 0; k < CDL_NARMS; k++) if (CDL_ARMS[k].sky_bytes() > skyBytes) skyBytes = CDL_ARMS[k].sky_bytes();
  sky = skyBytes ? heap_caps_malloc(skyBytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) : NULL;
  for (int j = 0; j < CDL_NSCENES; j++)
    if (!load(&CDL_SCENES[j], &scenes[j], MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) || !load(&CDL_SCENES[j], &scenesPsram[j], MALLOC_CAP_SPIRAM)) {
      printf("CKERROR scene %s\n", CDL_SCENES[j].id); goto done;
    }
  if (skyBytes && !sky) { printf("CKERROR sky workspace\n"); goto done; }
  printf("CKINFO sky %p %u scene0 %p psram0 %p\n", sky, skyBytes, scenes[0].mem, scenesPsram[0].mem);
#if CDL_BENCH_MODE == 1
  cdl_microbench();
  timing();
  probe_minstret();
#else
  images();
#endif
done:
  printf("CANDELA END\n");
}
