// Experiment (PICOCALC-COMPILER-DEVICE-COST, scripts/02-experiment-tree.py): compile a Typed app again and again in
// one boot, with knobs, and print each compile's TYPEDCOMPILE line and the core-1 cache counters around it.
//   typedcost APP N [strip=0|1|2] [backend=lazy|all] [pad=KB] [flush]
// strip: QuickJS strip flags for the compile runtimes (0 none, 1 JS_STRIP_SOURCE, 2 JS_STRIP_DEBUG); a change of
//        strip, or flush, empties the bytecode cache first, and the first compile after it parses every source.
// backend: lazy (typed/rv32.js and the pass groups on demand) or all (typed/rv32-all.js: the three RV32 bundles
//        concatenated, every group installed before the call).
// pad:   a PSRAM block of KB kilobytes held across each compile (moves the compile's heap).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "soc/cache_reg.h"
#include "soc/soc.h"
#include "esp_rom_crc.h"
#include "p4.h"

extern int p4_typed_strip_flags;           // typed_p4.c (experiment)
void p4_typed_bytecode_flush(void);         // typed_p4.c (experiment)

#define L1_ENA (CACHE_L1_IBUS1_CNT_ENA | CACHE_L1_DBUS1_CNT_ENA)
#define L1_CLR (CACHE_L1_IBUS1_CNT_CLR | CACHE_L1_DBUS1_CNT_CLR)
#define L2_ENA (CACHE_L2_IBUS1_CNT_ENA | CACHE_L2_DBUS1_CNT_ENA)
#define L2_CLR (CACHE_L2_IBUS1_CNT_CLR | CACHE_L2_DBUS1_CNT_CLR)

static void counters_start(void) {
  REG_WRITE(CACHE_L1_CACHE_ACS_CNT_CTRL_REG, L1_ENA | L1_CLR);
  REG_WRITE(CACHE_L2_CACHE_ACS_CNT_CTRL_REG, L2_ENA | L2_CLR);
  REG_WRITE(CACHE_L1_CACHE_ACS_CNT_CTRL_REG, L1_ENA);
  REG_WRITE(CACHE_L2_CACHE_ACS_CNT_CTRL_REG, L2_ENA);
}

void p4_typed_cost_console(const char *args) {
  char name[32] = "";
  int n = 1, strip = p4_typed_strip_flags, pad = 0, consumed = 0;
  bool all = false, flush = false;
  if (sscanf(args, "%31s %d%n", name, &n, &consumed) < 2) {
    puts("typedcost APP N [strip=0|1|2] [backend=lazy|all] [pad=KB] [flush]");
    return;
  }
  for (const char *p = args + consumed; *p;) {
    while (*p == ' ') p++;
    if (!strncmp(p, "strip=", 6)) strip = atoi(p + 6);
    else if (!strncmp(p, "backend=all", 11)) all = true;
    else if (!strncmp(p, "backend=lazy", 12)) all = false;
    else if (!strncmp(p, "pad=", 4)) pad = atoi(p + 4);
    else if (!strncmp(p, "flush", 5)) flush = true;
    while (*p && *p != ' ') p++;
  }
  const p4_typed_app *app = p4_typed_app_find(name);
  if (!app) { printf("typedcost: no app %s\n", name); return; }
  if (strip != p4_typed_strip_flags || flush) {
    p4_typed_bytecode_flush();
    p4_typed_strip_flags = strip;
  }
  for (int i = 0; i < n; i++) {
    void *block = pad > 0 ? port_heap_malloc((size_t)pad * 1024) : NULL;
    const char *bundled = app->n_variants ? app->variants[0].source : app->source;
    size_t source_length = 0, reactor_length = 0, length = 0;
    char *source = p4_bundle_read(bundled, &source_length, NULL, 0);
    char *reactor = p4_bundle_read(app->reactor, &reactor_length, NULL, 0);
    p4_compile_limits limits = p4_typed_app_limits(app);
    if (all) limits.rv32_backend = "typed/rv32-all.js";
    counters_start();
    vtime_t started = port_clock();
    char *module = source && reactor ? p4_typed_compile(app->name, "typedcost", source, source_length, app->link,
                                                        app->entry, app->compiler, reactor, reactor_length, &length,
                                                        started, &limits) : NULL;
    uint32_t v[12] = {
      REG_READ(CACHE_L1_IBUS1_ACS_HIT_CNT_REG), REG_READ(CACHE_L1_IBUS1_ACS_MISS_CNT_REG),
      REG_READ(CACHE_L1_DBUS1_ACS_HIT_CNT_REG), REG_READ(CACHE_L1_DBUS1_ACS_MISS_CNT_REG),
      REG_READ(CACHE_L1_DBUS1_ACS_NXTLVL_RD_CNT_REG), REG_READ(CACHE_L1_DBUS1_ACS_NXTLVL_WR_CNT_REG),
      REG_READ(CACHE_L2_IBUS1_ACS_HIT_CNT_REG), REG_READ(CACHE_L2_IBUS1_ACS_MISS_CNT_REG),
      REG_READ(CACHE_L2_DBUS1_ACS_HIT_CNT_REG), REG_READ(CACHE_L2_DBUS1_ACS_MISS_CNT_REG),
      REG_READ(CACHE_L2_DBUS1_ACS_NXTLVL_RD_CNT_REG), REG_READ(CACHE_L2_DBUS1_ACS_NXTLVL_WR_CNT_REG),
    };
    printf("TYPEDCOST {\"app\":\"%s\",\"rep\":%d,\"strip\":%d,\"backend\":\"%s\",\"padKb\":%d,\"ok\":%s,\"moduleBytes\":%zu,"
           "\"moduleCrc\":%u,\"l1iHit\":%lu,\"l1iMiss\":%lu,\"l1dHit\":%lu,\"l1dMiss\":%lu,\"l1dNextRd\":%lu,\"l1dNextWr\":%lu,"
           "\"l2iHit\":%lu,\"l2iMiss\":%lu,\"l2dHit\":%lu,\"l2dMiss\":%lu,\"l2dNextRd\":%lu,\"l2dNextWr\":%lu}\n",
           app->name, i, p4_typed_strip_flags, all ? "all" : "lazy", pad, module ? "true" : "false", module ? length : 0,
           module ? (unsigned)esp_rom_crc32_le(0, (const uint8_t *)module, length) : 0u,
           (unsigned long)v[0], (unsigned long)v[1], (unsigned long)v[2], (unsigned long)v[3], (unsigned long)v[4],
           (unsigned long)v[5], (unsigned long)v[6], (unsigned long)v[7], (unsigned long)v[8], (unsigned long)v[9],
           (unsigned long)v[10], (unsigned long)v[11]);
    free(module);
    free(source);
    free(reactor);
    if (block) port_heap_free(block);
  }
}
