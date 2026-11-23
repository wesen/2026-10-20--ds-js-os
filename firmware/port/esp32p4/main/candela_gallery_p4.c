// candela_gallery_p4.c: the Candela gallery on the ESP32-P4 (PICOCALC-CANDELA-GALLERY, PICOCALC_CANDELA_GALLERY).
//
// A worker task on core 1, below the kernel task's priority (it runs in the kernel's idle time, as the painter's
// build worker does), renders the gallery's scenes with nucleus/candela_gallery.c: CPU-KERNEL's kernel with every
// CPU substitution, the scene's sections in SECTIONS' interpreter, progressive passes. After the first coarse
// sub-pass, the half sub-pass, and passes (at most every 0.4 s, or every 1.5 s inside a long pass) it tone maps the
// accumulation, upscales it to 320 x 320 and publishes the frame in a triple buffer. The compositor
// (js/system/compositor.js drawGallery) draws the gallery world's frames with fb.raytrace(skip, 0, 0, 0, 1000):
// nucleus/gfx.c takes the newest frame here (p4_gallery_take) on the kernel task and draws a caption over it.
//
// The worker renders only while the gallery is on screen (a paint in the last 2 s). A scene ends when it reaches
// TARGET_PASSES passes and has been shown for HOLD_MS more, or after MAX_SHOW_MS on screen; then the next scene
// starts. The gallery world's skip counter (a key) moves to the next or previous scene at once.
//
// Two kernel arms render the same scenes (PICOCALC-CANDELA-TYPED): "cpp", the generated C++ kernel with the section
// interpreter (cg, cgs), and, with PICOCALC_CANDELA_TYPED, "typed", the kernel and sections in Typed compiled to RV32
// on the handheld (candela_typed_p4.c: cgt, cgts). The gallery draws with ARM_DEFAULT (C++) unless the console
// chooses (gallery arm typed). Typed's program is compiled on its first use after a firmware update and read from the
// compiled-module cache afterwards; while it loads, the gallery draws with C++ and the caption says so, and the next
// scene after it is ready draws with Typed. "scene" records name the arm that drew the scene.
//
// UART records, one JSON object per line after "CGAL ": scene (when a scene ends), first (its first image), pass,
// digest (console: gallery digest ID PASSES [psram|internal|quiet] [typed|cpp]), status, error. Console: gallery
// status|next|prev|scene ID|pause|resume|arm [typed|cpp]|digest ID PASSES [psram|internal|quiet] [typed|cpp]|probe MS|list.
#include "candela_gallery.h"
#include "esp_cpu.h"
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include <inttypes.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern const cg_instance cg_gallery, cgs_gallery;
extern const char cg_kernel_fixed_sha256[];
enum { ARM_CPP, ARM_TYPED };
static const char *const ARM[] = {"cpp", "typed"};
#if PICOCALC_CANDELA_TYPED
extern const cg_instance cgt_gallery, cgts_gallery;
#define ARMS 2
#ifndef ARM_DEFAULT
#define ARM_DEFAULT ARM_CPP   // Typed once its program compiles beside the running system (PICOCALC-COMPILE-CACHE)
#endif
#else
#define ARMS 1
#define ARM_DEFAULT ARM_CPP
#endif

enum { SIDE = 320, TARGET_PASSES = 64, HOLD_MS = 6000, MAX_SHOW_MS = 60000, VISIBLE_MS = 2000,
       PASS_DISPLAY_MS = 400, LONG_DISPLAY_MS = 1500, DISPLAY_SHARE = 10, STACK = 24 * 1024, PRIORITY = 1 };
enum { C_STEP, C_SCENE, C_PAUSE, C_RESUME, C_DIGEST, C_STATUS, C_PROBE, C_ARM };
typedef struct { int op, a, b, c, d; } command;

static QueueHandle_t commands;
static uint16_t *frames[3];
static atomic_uint mid = 2;              // the frame between writer and reader; bit 2: newer than the reader's
static int writer = 0, reader = 1, published;
static atomic_llong last_paint_us;
static atomic_int last_skip;
static bool skip_seen;

// what the caption shows: written by the worker, read by the kernel task (a stale value is harmless)
static volatile int st_scene = -1, st_pass, st_done, st_paused;
static volatile float st_spp_s;

static int64_t now_us(void) { return esp_timer_get_time(); }
static void *big(size_t n) { return heap_caps_aligned_alloc(16, (n + 15) & ~(size_t)15, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT); }
static void *fast(size_t n) {
  void *p = heap_caps_aligned_alloc(16, (n + 15) & ~(size_t)15, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
  return p ? p : big(n);
}
static const cg_alloc ALLOC = {big, fast, heap_caps_free};
static int arm = ARM_DEFAULT;     // the gallery's arm (the worker's; a digest names its own)
static int drawing = ARM_CPP;     // the arm of the scene on screen: C++ while Typed's program loads
static const cg_instance *instance_of(const cg_scene_desc *d, int a) {
#if PICOCALC_CANDELA_TYPED
  if (a == ARM_TYPED) return d->spectral ? &cgts_gallery : &cgt_gallery;
#endif
  (void)a;
  return d->spectral ? &cgs_gallery : &cg_gallery;
}
// The worker's arm for a new scene: Typed once its program is loaded (candela_typed_p4.c cgt_ready_now), else C++.
static int arm_now(void) {
#if PICOCALC_CANDELA_TYPED
  if (arm == ARM_TYPED && !cgt_ready_now()) return ARM_CPP;
#endif
  return arm;
}

static void publish(void) {
  writer = (int)(atomic_exchange(&mid, (unsigned)writer | 4u) & 3u);
  published = 1;
}

// What the caption says about the kernel: "Typed", "C++", or "C++, Typed compiling 12 s" during the load.
static const char *arm_caption(void) {
#if PICOCALC_CANDELA_TYPED
  if (arm == ARM_TYPED && drawing == ARM_CPP) return cgt_caption();
#endif
  return drawing == ARM_TYPED ? "Typed" : "C++";
}

// ---- the kernel task's side (nucleus/gfx.c) ----
void p4_gallery_start(void);
// The compositor's first draw of the gallery starts the worker and allocates its frames, so a firmware whose gallery
// is never shown spends nothing on it.
const uint16_t *p4_gallery_take(int skip, char *left, size_t nl, char *right, size_t nr) {
  if (!commands) p4_gallery_start();
  atomic_store(&last_paint_us, now_us());
  if (!skip_seen) { atomic_store(&last_skip, skip); skip_seen = true; }
  const int d = skip - atomic_exchange(&last_skip, skip);
  if (d && commands) { const command c = {C_STEP, d, 0}; xQueueSend(commands, &c, 0); }
  const int k = st_scene;
  if (k >= 0 && k < (int)cg_nscenes) {
    snprintf(left, nl, "%s  %s", cg_scenes[k].id, cg_scenes[k].title);
    if (st_paused) snprintf(right, nr, "paused");
    else snprintf(right, nr, "%d spp%s  %.2f s/pass  %s", st_pass, st_done ? " done" : "", (double)st_spp_s, arm_caption());
  } else {
    snprintf(left, nl, "Candela gallery");
    snprintf(right, nr, "starting");
  }
  if (atomic_load(&mid) & 4u) reader = (int)(atomic_exchange(&mid, (unsigned)reader) & 3u);
  return published ? frames[reader] : NULL;
}

// ---- the worker ----
typedef struct {
  int64_t start_us, shown_us, first_us, coarse_us, half_us, pass1_us, last_display_us, done_us, last_visible_us;
  uint64_t render_cycles, display_cycles, samples_at_pass1;
  int64_t render_us, display_us;
  unsigned displays, sky_rebuilt;
  size_t int_free0, psram_free0;
  bool monitored;
} scene_clock;

static cg_state st;
static uint16_t *disp;
static scene_clock sc;
static int current = -1;
static bool paused, done;
static char err[160];

static void record_error(const char *what) {
  printf("CGAL {\"ev\":\"error\",\"scene\":\"%s\",\"what\":\"%s\",\"error\":\"%s\"}\n",
         current >= 0 ? cg_scenes[current].id : "", what, err);
}

static void end_scene(const char *reason) {
  if (current < 0 || !st.scene) return;
  size_t int_min = 0, psram_min = 0;
  if (sc.monitored) {
    int_min = heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL);
    psram_min = heap_caps_get_minimum_free_size(MALLOC_CAP_SPIRAM);
    heap_caps_monitor_local_minimum_free_size_stop();
  }
  const cg_scene_desc *d = st.scene;
  const double render_s = sc.render_us / 1e6, samples = (double)st.samples;
  const unsigned passes = st.pass;
  printf("CGAL {\"ev\":\"scene\",\"id\":\"%s\",\"arm\":\"%s\",\"w\":%d,\"h\":%d,\"reason\":\"%s\",\"passes\":%u,\"samples\":%" PRIu64
         ",\"firstImageMs\":%.1f,\"coarseMs\":%.1f,\"halfMs\":%.1f,\"pass1Ms\":%.1f,\"renderMs\":%.1f,\"shownMs\":%.1f,"
         "\"secPerPass\":%.4f,\"samplesPerSec\":%.1f,\"cyclesPerSample\":%.1f,\"displays\":%u,\"displayMs\":%.1f,"
         "\"displayCyclesMean\":%.0f,\"skyRebuilt\":%u,\"ev100\":%.4f,\"metered\":%u,\"meanLum\":%.6g,"
         "\"internalFree0\":%u,\"internalMinFree\":%u,\"psramFree0\":%u,\"psramMinFree\":%u,\"internalPeakUse\":%d,\"psramPeakUse\":%d}\n",
         d->id, ARM[drawing], d->w, d->h, reason, passes, st.samples,
         sc.first_us ? (sc.first_us - sc.start_us) / 1e3 : -1.0, sc.coarse_us ? (sc.coarse_us - sc.start_us) / 1e3 : -1.0,
         sc.half_us ? (sc.half_us - sc.start_us) / 1e3 : -1.0, sc.pass1_us ? (sc.pass1_us - sc.start_us) / 1e3 : -1.0,
         sc.render_us / 1e3, sc.shown_us / 1e3, passes ? render_s / (samples / (d->w * d->h)) : 0.0,
         render_s > 0 ? samples / render_s : 0.0, samples > 0 ? (double)sc.render_cycles / samples : 0.0,
         sc.displays, sc.display_us / 1e3, sc.displays ? (double)sc.display_cycles / sc.displays : 0.0,
         sc.sky_rebuilt, st.ev, st.metered, cg_mean_lum(&st),
         (unsigned)sc.int_free0, (unsigned)int_min, (unsigned)sc.psram_free0, (unsigned)psram_min,
         sc.monitored ? (int)(sc.int_free0 - int_min) : -1, sc.monitored ? (int)(sc.psram_free0 - psram_min) : -1);
  fflush(stdout);
  cg_end(&st);
}

static bool begin_scene(int k) {
  memset(&sc, 0, sizeof sc);
  sc.int_free0 = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
  sc.psram_free0 = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
  sc.monitored = heap_caps_monitor_local_minimum_free_size_start() == ESP_OK;
  sc.start_us = sc.last_visible_us = now_us();
  current = k; done = false; st_done = 0; st_pass = 0; st_spp_s = 0;
  const cg_scene_desc *d = &cg_scenes[k];
  drawing = arm_now();
  if (cg_begin(&st, d, instance_of(d, drawing), &ALLOC, err, sizeof err)) {
    if (sc.monitored) heap_caps_monitor_local_minimum_free_size_stop();
    record_error("begin");
    return false;
  }
  sc.sky_rebuilt = st.bound == 2;
  st_scene = k;
  return true;
}

// After the first four passes, a pass is shown once PASS_DISPLAY_MS have passed since the last display, and at least
// DISPLAY_SHARE times as long as a display takes (one display, 160 x 160 tone mapped and upscaled, measured 131-145 ms
// on the worker: it would otherwise take 14% of B-01's minute).
static int64_t display_gap_us(void) {
  const int64_t mean = sc.displays ? sc.display_us / sc.displays : 0;
  return mean * DISPLAY_SHARE > PASS_DISPLAY_MS * 1000LL ? mean * DISPLAY_SHARE : PASS_DISPLAY_MS * 1000LL;
}

static void show(int64_t t) {
  const uint32_t c0 = esp_cpu_get_cycle_count();
  cg_display(&st, disp, CG_FAST);
  cg_upscale320(disp, st.w, st.h, frames[writer]);
  publish();
  const int64_t t1 = now_us();
  sc.display_cycles += esp_cpu_get_cycle_count() - c0;
  sc.display_us += t1 - t;
  sc.displays++;
  sc.last_display_us = t1;
  if (!sc.first_us) {
    sc.first_us = t1;
    printf("CGAL {\"ev\":\"first\",\"id\":\"%s\",\"ms\":%.1f,\"sub\":%u,\"pass\":%u,\"ev100\":%.4f,\"skyRebuilt\":%u}\n",
           st.scene->id, (t1 - sc.start_us) / 1e3, st.sub, st.pass, st.ev, sc.sky_rebuilt);
  }
}

#if PICOCALC_CANDELA_TYPED
#define typed_state cgt_state_name
#else
static const char *typed_state(void) { return "absent"; }
#endif

static void status(void) {
  printf("CGAL {\"ev\":\"status\",\"arm\":\"%s\",\"drawing\":\"%s\",\"typed\":\"%s\",\"scene\":\"%s\",\"index\":%d,\"scenes\":%u,\"pass\":%u,\"sub\":%u,\"samples\":%" PRIu64
         ",\"renderMs\":%.1f,\"displays\":%u,\"paused\":%d,\"done\":%d,\"visible\":%d,\"kernel\":\"%s\",\"internalFree\":%u,\"psramFree\":%u}\n",
         ARM[arm], ARM[drawing], typed_state(), current >= 0 ? cg_scenes[current].id : "", current, cg_nscenes, st.pass, st.sub,
         st.samples, sc.render_us / 1e3,
         sc.displays, paused, done, now_us() - atomic_load(&last_paint_us) < VISIBLE_MS * 1000LL, cg_kernel_fixed_sha256,
         (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL), (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
}

// The agreement measurement: a plain 1 spp pass at frame index 0 (CPU-KERNEL's frame digest), then the progressive
// render to the given number of passes as the gallery runs it, without displays: its accumulation digest, the fast
// display's digest, and the cycles per sample of the passes.
//
// The digest runs on a helper task on core 1 whose stack placement and priority the console chooses, so that one boot
// measures the same scene with the worker's conditions (PSRAM stack, below the kernel task), with an internal-RAM
// stack, and with nothing else on core 1 (above the kernel task, which then waits the few seconds the digest takes).
enum { V_PSRAM, V_INTERNAL, V_QUIET };
static const char *const VARIANT[] = {"psram", "internal", "quiet"};
static void digest(int k, int passes, int variant, int a) {
  cdl_pixout *line = (variant == V_PSRAM ? big : fast)(sizeof(cdl_pixout) * CG_MAX_SIDE);
  const cg_scene_desc *d = &cg_scenes[k];
  if (!line) { snprintf(err, sizeof err, "out of memory"); record_error("digest"); return; }
  const int64_t b0 = now_us();
  if (cg_begin(&st, d, instance_of(d, a), &ALLOC, err, sizeof err)) { record_error("digest"); heap_caps_free(line); return; }
  const int64_t b1 = now_us();
  double lum0, lum;
  uint32_t c0 = esp_cpu_get_cycle_count();
  const uint32_t f0 = cg_frame0_digest(&st, line, &lum0);
  const uint32_t frame0_cycles = esp_cpu_get_cycle_count() - c0;
  uint64_t cycles = 0;
  const int64_t t0 = now_us();
  while ((int)st.pass < passes) {
    c0 = esp_cpu_get_cycle_count();
    cg_advance(&st);
    cycles += esp_cpu_get_cycle_count() - c0;
  }
  const int64_t t1 = now_us();
  const uint32_t acc = cg_acc_digest(&st, &lum);
  cg_display(&st, disp, CG_FAST);
  const uint32_t dsp = cg_fnv(2166136261u, disp, sizeof(uint16_t) * st.w * st.h);
  printf("CGAL {\"ev\":\"digest\",\"id\":\"%s\",\"arm\":\"%s\",\"beginMs\":%.1f,\"w\":%d,\"h\":%d,\"frame0\":\"%08" PRIx32 "\",\"frame0MeanLum\":%.9g,\"frame0CyclesPerSample\":%.1f,"
         "\"passes\":%u,\"acc\":\"%08" PRIx32 "\",\"meanLum\":%.9g,\"disp\":\"%08" PRIx32 "\",\"ev100\":%.9g,\"cyclesPerSample\":%.1f,"
         "\"seconds\":%.3f,\"samples\":%" PRIu64 ",\"variant\":\"%s\"}\n",
         d->id, ARM[a], (b1 - b0) / 1e3, st.w, st.h, f0, lum0, (double)frame0_cycles / (st.w * st.h), st.pass, acc, lum, dsp, st.ev,
         (double)cycles / (double)st.samples, (t1 - t0) / 1e6, st.samples, VARIANT[variant]);
  fflush(stdout);
  cg_end(&st);
  heap_caps_free(line);
}

typedef struct { int k, passes, variant, arm; TaskHandle_t waiter; } digest_job;
static void digest_task(void *arg) {
  digest_job *j = arg;
  digest(j->k, j->passes, j->variant, j->arm);
  xTaskNotifyGive(j->waiter);
  vTaskSuspend(NULL);   // the worker deletes this task once notified
}
static void digest_on_helper(int k, int passes, int variant, int a) {
  digest_job j = {k, passes, variant, a, xTaskGetCurrentTaskHandle()};
  TaskHandle_t h = NULL;
  const UBaseType_t caps = variant == V_PSRAM ? MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT : MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
  if (xTaskCreatePinnedToCoreWithCaps(digest_task, "gallery-d", STACK, &j, variant == V_QUIET ? 6 : PRIORITY, &h, 1, caps) != pdPASS) {
    snprintf(err, sizeof err, "no %s stack for the digest", VARIANT[variant]);
    record_error("digest");
    return;
  }
  ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
  vTaskDeleteWithCaps(h);
}

// What a task at the worker's priority on core 1 loses to everything else there (the kernel task, the painter's
// build worker, interrupts): a loop reads the cycle counter for the given time, and every step longer than 1 us
// (360 cycles; the loop's own step is a few cycles) counts as time taken by someone else. Buckets of the gaps:
// < 10 us, < 100 us, < 1 ms, < 10 ms, longer.
typedef struct { int ms; TaskHandle_t waiter; } probe_job;
static void probe_task(void *arg) {
  probe_job *j = arg;
  const uint64_t span = (uint64_t)j->ms * 360000u;
  uint64_t elapsed = 0, stolen = 0, longest = 0;
  uint32_t n = 0, bucket[5] = {0};
  uint32_t prev = esp_cpu_get_cycle_count();
  while (elapsed < span) {
    const uint32_t c = esp_cpu_get_cycle_count(), gap = c - prev;
    prev = c;
    elapsed += gap;
    if (gap > 360) {
      stolen += gap; n++;
      if (gap > longest) longest = gap;
      bucket[gap < 3600 ? 0 : gap < 36000 ? 1 : gap < 360000 ? 2 : gap < 3600000 ? 3 : 4]++;
    }
  }
  printf("CGAL {\"ev\":\"probe\",\"ms\":%d,\"stolenPct\":%.2f,\"gaps\":%" PRIu32 ",\"gapsPerSecond\":%.1f,\"meanGapUs\":%.1f,"
         "\"longestGapUs\":%.1f,\"buckets\":[%" PRIu32 ",%" PRIu32 ",%" PRIu32 ",%" PRIu32 ",%" PRIu32 "]}\n",
         j->ms, 100.0 * stolen / elapsed, n, n / (elapsed / 360e6), n ? stolen / 360.0 / n : 0.0, longest / 360.0,
         bucket[0], bucket[1], bucket[2], bucket[3], bucket[4]);
  fflush(stdout);
  xTaskNotifyGive(j->waiter);
  vTaskSuspend(NULL);
}
static void probe(int ms) {
  probe_job j = {ms, xTaskGetCurrentTaskHandle()};
  TaskHandle_t h = NULL;
  if (xTaskCreatePinnedToCoreWithCaps(probe_task, "gallery-p", 4096, &j, PRIORITY, &h, 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) != pdPASS) {
    snprintf(err, sizeof err, "no stack for the probe");
    record_error("probe");
    return;
  }
  ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
  vTaskDeleteWithCaps(h);
}

static int next_index(int k, int delta) {
  const int n = (int)cg_nscenes;
  return ((k + delta) % n + n) % n;
}

static void handle(const command *c) {
  switch (c->op) {
    case C_STEP:
      end_scene(c->a > 0 ? "next" : "previous");
      begin_scene(next_index(current < 0 ? 0 : current, c->a));
      break;
    case C_SCENE:
      end_scene("chosen");
      begin_scene(c->a);
      break;
    case C_PAUSE: paused = true; st_paused = 1; break;
    case C_RESUME: paused = false; st_paused = 0; break;
    case C_DIGEST: {
      const int resume = current;
      end_scene("digest");
      current = -1;
      digest_on_helper(c->a, c->b, c->c, c->d);
      begin_scene(resume < 0 ? 0 : resume);
      break;
    }
    case C_STATUS: status(); break;
    case C_ARM:
      end_scene("arm");
      arm = c->a;
      begin_scene(current < 0 ? 0 : current);
      break;
    case C_PROBE: probe(c->a); break;
  }
}

static void worker(void *arg) {
  (void)arg;
  for (;;) {
    command c;
    const int64_t t = now_us();
    const bool visible = t - atomic_load(&last_paint_us) < VISIBLE_MS * 1000LL;
    const bool idle = paused || !visible || done || current < 0;
    if (xQueueReceive(commands, &c, idle ? pdMS_TO_TICKS(100) : 0) == pdTRUE) { handle(&c); continue; }
    if (current < 0) {
      if (visible && !paused) begin_scene(0);
      continue;
    }
    if (!st.scene) {   // the scene could not begin: move on after a pause
      vTaskDelay(pdMS_TO_TICKS(500));
      begin_scene(next_index(current, 1));
      continue;
    }
    if (visible && !paused) { sc.shown_us += t - sc.last_visible_us; }
    sc.last_visible_us = t;
    if (paused || !visible) continue;
#if PICOCALC_CANDELA_TYPED
    // Typed preferred while C++ draws: cgt_poll compiles it once compiles are quiet; when it is ready a scene that has
    // barely begun restarts with it, a later one leaves it to the next scene.
    if (arm == ARM_TYPED && drawing == ARM_CPP && cgt_poll() && st.pass < 2) {
      end_scene("typed-ready");
      begin_scene(current);
      continue;
    }
#endif
    if (done) {
      if (t - sc.done_us >= HOLD_MS * 1000LL) { end_scene("target"); begin_scene(next_index(current, 1)); }
      continue;
    }
    if (sc.shown_us >= MAX_SHOW_MS * 1000LL && st.pass >= 1) { end_scene("time"); begin_scene(next_index(current, 1)); continue; }
    const uint32_t c0 = esp_cpu_get_cycle_count();
    const int ev = cg_advance(&st);
    const int64_t t1 = now_us();
    sc.render_cycles += esp_cpu_get_cycle_count() - c0;
    sc.render_us += t1 - t;
    if (ev == CG_EV_COARSE) sc.coarse_us = t1;
    if (ev == CG_EV_HALF) sc.half_us = t1;
    if (ev == CG_EV_PASS) {
      if (st.pass == 1) { sc.pass1_us = t1; sc.samples_at_pass1 = st.samples; }
      st_pass = (int)st.pass;
      st_spp_s = (float)(sc.render_us / 1e6 / st.pass);
      printf("CGAL {\"ev\":\"pass\",\"id\":\"%s\",\"pass\":%u,\"renderMs\":%.1f,\"cyclesPerSample\":%.1f,\"ev100\":%.4f}\n",
             st.scene->id, st.pass, sc.render_us / 1e3, (double)sc.render_cycles / (double)st.samples, st.ev);
      if (st.pass >= TARGET_PASSES) { done = true; st_done = 1; sc.done_us = t1; }
    }
    const bool coarse_ready = st.pass > 0 || st.sub >= 1;
    if (ev == CG_EV_COARSE || ev == CG_EV_HALF ||
        (ev == CG_EV_PASS && (st.pass <= 4 || t1 - sc.last_display_us >= display_gap_us() || done)) ||
        (coarse_ready && t1 - sc.last_display_us >= LONG_DISPLAY_MS * 1000LL))
      show(t1);
  }
}

void p4_gallery_start(void) {
  static bool tried;
  if (commands || tried) return;
  tried = true;
  if (strcmp(cg_kernel_fixed_sha256, cg_scenes_fixed_kernel_sha256)) {
    printf("CGAL {\"ev\":\"error\",\"what\":\"start\",\"error\":\"scenes compiled against fixed kernel %s, firmware kernel %s\"}\n",
           cg_scenes_fixed_kernel_sha256, cg_kernel_fixed_sha256);
    return;
  }
  for (int k = 0; k < 3; k++) frames[k] = big(SIDE * SIDE * sizeof(uint16_t));
  disp = big(CG_MAX_SIDE * CG_MAX_SIDE * sizeof(uint16_t));
  commands = xQueueCreate(8, sizeof(command));
  if (!frames[0] || !frames[1] || !frames[2] || !disp || !commands ||
      xTaskCreatePinnedToCoreWithCaps(worker, "gallery", STACK, NULL, PRIORITY, NULL, 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) != pdPASS)
    printf("CGAL {\"ev\":\"error\",\"what\":\"start\",\"error\":\"out of memory\"}\n");
}

static int arm_named(const char *s) {
  for (int a = 0; a < ARMS; a++) if (!strcmp(s, ARM[a])) return a;
  return -1;
}

static int find(const char *id) {
  for (unsigned k = 0; k < cg_nscenes; k++) if (!strcmp(cg_scenes[k].id, id)) return (int)k;
  return -1;
}

void p4_gallery_console(const char *args) {
  char a[16] = "", b[16] = "", v[16] = "psram", w[16] = ""; int n = 0;
  const int got = sscanf(args, "%15s %15s %d %15s %15s", a, b, &n, v, w);
  command c = {C_STATUS, 0, 0, 0, arm};
  if (got < 1 || !strcmp(a, "status")) c.op = C_STATUS;
  else if (!strcmp(a, "next")) { c.op = C_STEP; c.a = 1; }
  else if (!strcmp(a, "prev")) { c.op = C_STEP; c.a = -1; }
  else if (!strcmp(a, "pause")) c.op = C_PAUSE;
  else if (!strcmp(a, "resume")) c.op = C_RESUME;
  else if (!strcmp(a, "arm") && got >= 2 && arm_named(b) >= 0) { c.op = C_ARM; c.a = arm_named(b); }
  else if (!strcmp(a, "arm")) {
    printf("CGAL {\"ev\":\"arm\",\"arm\":\"%s\",\"drawing\":\"%s\",\"typed\":\"%s\",\"arms\":%d}\n", ARM[arm], ARM[drawing],
           typed_state(), ARMS);
    return;
  }
  else if (!strcmp(a, "probe") && got >= 2 && atoi(b) >= 100 && atoi(b) <= 60000) { c.op = C_PROBE; c.a = atoi(b); }
  else if (!strcmp(a, "list")) {
    for (unsigned k = 0; k < cg_nscenes; k++)
      printf("CGAL {\"ev\":\"scene-list\",\"index\":%u,\"id\":\"%s\",\"title\":\"%s\",\"w\":%d,\"h\":%d,\"spectral\":%d}\n", k,
             cg_scenes[k].id, cg_scenes[k].title, cg_scenes[k].w, cg_scenes[k].h, cg_scenes[k].spectral);
    return;
  } else if (!strcmp(a, "scene") && got >= 2 && find(b) >= 0) { c.op = C_SCENE; c.a = find(b); }
  else if (!strcmp(a, "digest") && got >= 3 && find(b) >= 0 && n >= 1 && n <= 1024 &&
           (!strcmp(v, "psram") || !strcmp(v, "internal") || !strcmp(v, "quiet")) && (got < 5 || arm_named(w) >= 0)) {
    c.op = C_DIGEST; c.a = find(b); c.b = n; c.c = !strcmp(v, "psram") ? V_PSRAM : !strcmp(v, "internal") ? V_INTERNAL : V_QUIET;
    c.d = got >= 5 ? arm_named(w) : arm;
  }
  else { puts("gallery status|next|prev|pause|resume|list|arm [typed|cpp]|scene ID|digest ID PASSES [psram|internal|quiet] [typed|cpp]|probe MS"); return; }
  p4_gallery_start();
  if (!commands || xQueueSend(commands, &c, 0) != pdTRUE) puts("gallery: not running or busy");
}
