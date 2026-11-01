// Measuring the P4's caches (PICOCALC-SPEED): the console command
//   cachestat loop|fib [default|internal|psram]   one calibration program in a fresh QuickJS runtime whose heap is
//                                                 the C library's (as the boot calibration), internal SRAM only, or
//                                                 PSRAM only (as every world's); its time and the cache counters
//   cachestat start | show                        the counters over a window of the running system
//   cachestat mem                                 what a read and a write cost in internal SRAM, LP SRAM and PSRAM
// The counters are the cache's own access counters (soc/cache_reg.h): per bus, hits, misses, conflicts (a miss that
// evicted a line) and requests to the next level, for the L1 instruction caches of the two cores, the L1 data cache
// as each core uses it, and the L2 as each core's L1 misses reach it. The kernel runs on core 1.
#include <stdio.h>
#include <string.h>
#include "esp_heap_caps.h"
#include "soc/cache_reg.h"
#include "soc/soc.h"
#include "quickjs.h"
#include "nucleus.h"
#include "p4.h"

#define L1_ENA (CACHE_L1_IBUS0_CNT_ENA | CACHE_L1_IBUS1_CNT_ENA | CACHE_L1_DBUS0_CNT_ENA | CACHE_L1_DBUS1_CNT_ENA)
#define L1_CLR (CACHE_L1_IBUS0_CNT_CLR | CACHE_L1_IBUS1_CNT_CLR | CACHE_L1_DBUS0_CNT_CLR | CACHE_L1_DBUS1_CNT_CLR)
#define L2_ENA (CACHE_L2_IBUS0_CNT_ENA | CACHE_L2_IBUS1_CNT_ENA | CACHE_L2_DBUS0_CNT_ENA | CACHE_L2_DBUS1_CNT_ENA)
#define L2_CLR (CACHE_L2_IBUS0_CNT_CLR | CACHE_L2_IBUS1_CNT_CLR | CACHE_L2_DBUS0_CNT_CLR | CACHE_L2_DBUS1_CNT_CLR)

typedef struct { const char *name; uint32_t hit, miss, conflict, rd, wr; } cbus_t;   // each a register, wr 0 if none

static const cbus_t BUSES[] = {
  { "L1 ibus0 (core 0 code)", CACHE_L1_IBUS0_ACS_HIT_CNT_REG, CACHE_L1_IBUS0_ACS_MISS_CNT_REG, CACHE_L1_IBUS0_ACS_CONFLICT_CNT_REG, CACHE_L1_IBUS0_ACS_NXTLVL_RD_CNT_REG, 0 },
  { "L1 ibus1 (core 1 code)", CACHE_L1_IBUS1_ACS_HIT_CNT_REG, CACHE_L1_IBUS1_ACS_MISS_CNT_REG, CACHE_L1_IBUS1_ACS_CONFLICT_CNT_REG, CACHE_L1_IBUS1_ACS_NXTLVL_RD_CNT_REG, 0 },
  { "L1 dbus0 (core 0 data)", CACHE_L1_DBUS0_ACS_HIT_CNT_REG, CACHE_L1_DBUS0_ACS_MISS_CNT_REG, CACHE_L1_DBUS0_ACS_CONFLICT_CNT_REG, CACHE_L1_DBUS0_ACS_NXTLVL_RD_CNT_REG, CACHE_L1_DBUS0_ACS_NXTLVL_WR_CNT_REG },
  { "L1 dbus1 (core 1 data)", CACHE_L1_DBUS1_ACS_HIT_CNT_REG, CACHE_L1_DBUS1_ACS_MISS_CNT_REG, CACHE_L1_DBUS1_ACS_CONFLICT_CNT_REG, CACHE_L1_DBUS1_ACS_NXTLVL_RD_CNT_REG, CACHE_L1_DBUS1_ACS_NXTLVL_WR_CNT_REG },
  { "L2 ibus0 (core 0 code)", CACHE_L2_IBUS0_ACS_HIT_CNT_REG, CACHE_L2_IBUS0_ACS_MISS_CNT_REG, CACHE_L2_IBUS0_ACS_CONFLICT_CNT_REG, CACHE_L2_IBUS0_ACS_NXTLVL_RD_CNT_REG, 0 },
  { "L2 ibus1 (core 1 code)", CACHE_L2_IBUS1_ACS_HIT_CNT_REG, CACHE_L2_IBUS1_ACS_MISS_CNT_REG, CACHE_L2_IBUS1_ACS_CONFLICT_CNT_REG, CACHE_L2_IBUS1_ACS_NXTLVL_RD_CNT_REG, 0 },
  { "L2 dbus0 (core 0 data)", CACHE_L2_DBUS0_ACS_HIT_CNT_REG, CACHE_L2_DBUS0_ACS_MISS_CNT_REG, CACHE_L2_DBUS0_ACS_CONFLICT_CNT_REG, CACHE_L2_DBUS0_ACS_NXTLVL_RD_CNT_REG, CACHE_L2_DBUS0_ACS_NXTLVL_WR_CNT_REG },
  { "L2 dbus1 (core 1 data)", CACHE_L2_DBUS1_ACS_HIT_CNT_REG, CACHE_L2_DBUS1_ACS_MISS_CNT_REG, CACHE_L2_DBUS1_ACS_CONFLICT_CNT_REG, CACHE_L2_DBUS1_ACS_NXTLVL_RD_CNT_REG, CACHE_L2_DBUS1_ACS_NXTLVL_WR_CNT_REG },
};
#define N_BUSES (sizeof BUSES / sizeof *BUSES)

static vtime_t window_t0;

static void counters_start(void) {
  REG_WRITE(CACHE_L1_CACHE_ACS_CNT_CTRL_REG, L1_ENA | L1_CLR);
  REG_WRITE(CACHE_L2_CACHE_ACS_CNT_CTRL_REG, L2_ENA | L2_CLR);
  REG_WRITE(CACHE_L1_CACHE_ACS_CNT_CTRL_REG, L1_ENA);   // the clear bits are write-trigger; enabled, counting from 0
  REG_WRITE(CACHE_L2_CACHE_ACS_CNT_CTRL_REG, L2_ENA);
}

static void counters_print(void) {
  uint32_t v[N_BUSES][5];
  for (size_t i = 0; i < N_BUSES; i++) {   // read them all first, so printing does not count
    const cbus_t *b = &BUSES[i];
    v[i][0] = REG_READ(b->hit); v[i][1] = REG_READ(b->miss); v[i][2] = REG_READ(b->conflict);
    v[i][3] = REG_READ(b->rd); v[i][4] = b->wr ? REG_READ(b->wr) : 0;
  }
  printf("  %-24s %12s %10s %10s %10s %10s %7s\n", "bus", "hit", "miss", "conflict", "next rd", "next wr", "miss %");
  for (size_t i = 0; i < N_BUSES; i++) {
    uint64_t all = (uint64_t)v[i][0] + v[i][1];
    printf("  %-24s %12lu %10lu %10lu %10lu %10lu %7.3f\n", BUSES[i].name, (unsigned long)v[i][0], (unsigned long)v[i][1],
           (unsigned long)v[i][2], (unsigned long)v[i][3], (unsigned long)v[i][4], all ? 100.0 * v[i][1] / all : 0.0);
  }
}

// ---- where memory is ------------------------------------------------------------------------------------------------
enum { R_L2MEM, R_LP, R_TCM, R_PSRAM, R_OTHER, N_REGIONS };
static const char *const REGION[] = { "L2MEM (internal)", "LP SRAM", "TCM", "PSRAM", "other" };
static int region_of(const void *p) {
  uintptr_t a = (uintptr_t)p;
  if (a >= SOC_DRAM_LOW && a < SOC_DRAM_HIGH) return R_L2MEM;
  if (a >= SOC_RTC_DRAM_LOW && a < SOC_RTC_DRAM_HIGH) return R_LP;
  if (a >= SOC_TCM_LOW && a < SOC_TCM_LOW + 0x2000) return R_TCM;
  if (a >= SOC_EXTRAM_LOW && a < SOC_EXTRAM_HIGH) return R_PSRAM;
  return R_OTHER;
}

// ---- a benchmark runtime on a chosen heap ------------------------------------------------------------------------
static uint32_t heap_caps_of;   // 0: the C library's malloc
static unsigned placed[N_REGIONS], placed_bytes[N_REGIONS];   // the runtime's allocations, by region
static void count(void *p, size_t n) { if (p) { int r = region_of(p); placed[r]++; placed_bytes[r] += n; } }
static void *b_malloc(JSMallocState *s, size_t n) {
  void *p = heap_caps_of ? heap_caps_malloc(n, heap_caps_of) : malloc(n);
  if (p) { s->malloc_size += heap_caps_get_allocated_size(p) + 8; s->malloc_count++; }
  count(p, n);
  return p;
}
static void b_free(JSMallocState *s, void *p) {
  if (!p) return;
  s->malloc_size -= heap_caps_get_allocated_size(p) + 8; s->malloc_count--;
  free(p);   // heap_caps_free and free are the same allocator
}
static void *b_realloc(JSMallocState *s, void *p, size_t n) {
  if (!p) return n ? b_malloc(s, n) : NULL;
  size_t old = heap_caps_get_allocated_size(p) + 8;
  if (!n) { b_free(s, p); return NULL; }
  void *q = heap_caps_of ? heap_caps_realloc(p, n, heap_caps_of) : realloc(p, n);
  if (q) s->malloc_size = s->malloc_size - old + heap_caps_get_allocated_size(q) + 8;
  if (q != p) count(q, n);
  return q;
}
static size_t b_usable(const void *p) { return heap_caps_get_allocated_size((void *)p); }
static const JSMallocFunctions BMF = { b_malloc, b_free, b_realloc, b_usable };

static const char *const PROGRAMS[][2] = {
  { "loop", "(()=>{let s=0; for(let i=0;i<100000;i++) s+=i; return s;})()" },
  { "fib", "(()=>{function fib(n){return n<2?n:fib(n-1)+fib(n-2)} return fib(20);})()" },
};

static void bench(const char *which, const char *heap) {
  const char *src = NULL;
  for (size_t i = 0; i < 2; i++) if (!strcmp(which, PROGRAMS[i][0])) src = PROGRAMS[i][1];
  if (!src) { printf("cachestat loop|fib [default|internal|psram] | start | show\n"); return; }
  heap_caps_of = !strcmp(heap, "internal") ? MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT : !strcmp(heap, "psram") ? MALLOC_CAP_SPIRAM : 0;
  if (heap_caps_of == 0 && strcmp(heap, "default")) { printf("the heap is default, internal or psram\n"); return; }
  memset(placed, 0, sizeof placed); memset(placed_bytes, 0, sizeof placed_bytes);
  size_t in0 = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
  JSRuntime *rt = JS_NewRuntime2(&BMF, NULL);
  JSContext *ctx = rt ? JS_NewContext(rt) : NULL;
  if (!ctx) { printf("could not make a runtime on the %s heap\n", heap); if (rt) JS_FreeRuntime(rt); return; }
  size_t in1 = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
  counters_start();
  vtime_t t0 = port_clock();
  JSValue r = JS_Eval(ctx, src, strlen(src), "cachestat.js", JS_EVAL_TYPE_GLOBAL);
  vtime_t t1 = port_clock();
  printf("cachestat %s on the %s heap: %.1f ms; the runtime at %p, %u bytes of internal SRAM taken by the runtime\n",
         which, heap, (t1 - t0) / 1000.0, (void *)rt, (unsigned)(in0 - in1));
  counters_print();
  printf("  allocations by region (runtime, context and the run):");
  for (int i = 0; i < N_REGIONS; i++) if (placed[i]) printf(" %s %u (%u bytes);", REGION[i], placed[i], placed_bytes[i]);
  printf("\n");
  JS_FreeValue(ctx, r);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
}

// The same reads and writes, 1 KB at a time, in each kind of memory: what an access costs where it lands.
static void mem_speed(void) {
  static const struct { const char *name; uint32_t caps; } KINDS[] = {
    { "L2MEM (internal, DMA-capable)", MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA | MALLOC_CAP_8BIT },
    { "LP SRAM (RTC fast memory)", MALLOC_CAP_RTCRAM },
    { "PSRAM", MALLOC_CAP_SPIRAM },
  };
  for (size_t k = 0; k < sizeof KINDS / sizeof *KINDS; k++) {
    volatile uint32_t *m = heap_caps_malloc(1024, KINDS[k].caps);
    if (!m) { printf("  %-30s no memory\n", KINDS[k].name); continue; }
    vtime_t t0 = port_clock();
    uint32_t sum = 0;
    for (int rep = 0; rep < 1000; rep++)
      for (int i = 0; i < 256; i++) { sum += m[i]; m[i] = sum; }
    vtime_t t1 = port_clock();
    printf("  %-30s at %p: 256k reads and writes in %.2f ms (%.1f ns each)\n", KINDS[k].name, (void *)m, (t1 - t0) / 1000.0,
           (t1 - t0) * 1000.0 / 256000.0);
    heap_caps_free((void *)m);
  }
  printf("  free: internal %u (LP SRAM %u), PSRAM %u\n", (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
         (unsigned)heap_caps_get_free_size(MALLOC_CAP_RTCRAM), (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
}

void p4_cachestat(const char *args) {
  char a[16] = "", b[16] = "default";
  sscanf(args, "%15s %15s", a, b);
  if (!strcmp(a, "start")) { counters_start(); window_t0 = port_clock(); printf("cache counters started\n"); }
  else if (!strcmp(a, "mem")) mem_speed();
  else if (!strcmp(a, "show")) { printf("cache counters over %.1f ms\n", (port_clock() - window_t0) / 1000.0); counters_print(); }
  else bench(a, b);
}
