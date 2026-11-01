// Native worlds as machine code on the ESP32-P4 (engine "native"): ELF modules, built with sdk/nw_elf.c as position-
// independent shared objects, which Espressif's elf_loader copies into PSRAM, relocates and calls. They are for
// trusted drivers, and nothing here isolates them:
//   - memory: the module runs in machine mode with the firmware, and the PMP leaves PSRAM and internal RAM open to
//     it; it can read and write anything, including the kernel. A store to an address with nothing behind it (0) is
//     an access fault, which panics the board;
//   - calls: what it links to is limited to the functions resolve() lists (a C library subset, the soft-float helpers
//     and nothing of ESP-IDF), so a module that needs anything else does not load. That is a contract, not a wall:
//     its code can jump to any address;
//   - time: it runs on the kernel's task until it returns. A turn that took longer than its budget is an overrun
//     when it returns, as for JavaScript on the real clock; a module that never returns stalls the kernel.
// So a module comes only from the firmware's manifest (system.elf.json, bundled with the build), never from storage:
// the kernel starts JavaScript and WebAssembly from storage, never machine code.
//
// What the kernel can do is account for it: its allocations go through malloc() here, are charged to the world,
// may not exceed its mem_kb, and are freed when the world stops; its system calls are the kernel's, with the same
// checks as for any other world.
#include <stdlib.h>
#include <string.h>
#include "esp_elf.h"
#include "esp_log.h"
#include "private/elf_symbol.h"
#include "nucleus.h"
#include "nw_elf.h"

#define EM_RISCV 243
#define EF_RISCV_FLOAT_ABI 0x6
#define EF_RISCV_FLOAT_ABI_SINGLE 0x2

typedef struct block {          // one allocation of a module, behind its header
  struct block *next, *prev;
  size_t size;
  uint32_t pad;                 // the header is 16 bytes, so what follows is aligned as the heap aligns
} block_t;

typedef struct {
  esp_elf_t elf;
  nw_elf_module mod;
  block_t *blocks;              // its live allocations
  size_t heap;                  // their bytes
} elf_t;

static world_t *now;            // the world whose code is running: its system calls and allocations are its own
static char missing[64];        // the first symbol resolve() did not have, while a module loads

// ---- what a module links to ----------------------------------------------------------------------------------
static void used(world_t *W, elf_t *x) { W->mem_used = x->elf.segment_size + x->heap; }

static void *m_malloc(size_t n) {
  elf_t *x = now ? now->nat->inst : NULL;
  if (!x || n > now->mem_limit || x->elf.segment_size + x->heap + n > now->mem_limit) return NULL;
  block_t *b = port_heap_malloc(sizeof *b + n);
  if (!b) return NULL;
  b->size = n;
  b->prev = NULL;
  b->next = x->blocks;
  if (x->blocks) x->blocks->prev = b;
  x->blocks = b;
  x->heap += n;
  used(now, x);
  return b + 1;
}

static void m_free(void *p) {
  if (!p || !now) return;
  elf_t *x = now->nat->inst;
  block_t *b = (block_t *)p - 1;
  if (b->prev) b->prev->next = b->next; else x->blocks = b->next;
  if (b->next) b->next->prev = b->prev;
  x->heap -= b->size;
  used(now, x);
  port_heap_free(b);
}

static void *m_calloc(size_t k, size_t n) {
  if (n && k > (size_t)-1 / n) return NULL;
  void *p = m_malloc(k * n);
  if (p) memset(p, 0, k * n);
  return p;
}

static void *m_realloc(void *p, size_t n) {
  if (!p) return m_malloc(n);
  if (!n) { m_free(p); return NULL; }
  block_t *b = (block_t *)p - 1;
  void *q = m_malloc(n);
  if (!q) return NULL;
  memcpy(q, p, b->size < n ? b->size : n);
  m_free(p);
  return q;
}

// libgcc's soft-float and 64-bit division helpers: the P4 has single-precision floats and 32-bit division in
// hardware, and libgcc.a is not position-independent, so a module calls the firmware's copies.
#define HELPERS(X) X(__adddf3) X(__subdf3) X(__muldf3) X(__divdf3) X(__negdf2) X(__eqdf2) X(__nedf2) X(__ltdf2) \
  X(__ledf2) X(__gtdf2) X(__gedf2) X(__unorddf2) X(__floatsidf) X(__floatunsidf) X(__floatdidf) X(__floatundidf) \
  X(__fixdfsi) X(__fixunsdfsi) X(__fixdfdi) X(__fixunsdfdi) X(__extendsfdf2) X(__truncdfsf2) X(__fixsfdi) \
  X(__fixunssfdi) X(__floatdisf) X(__floatundisf) X(__divdi3) X(__udivdi3) X(__moddi3) X(__umoddi3)
#define DECLARE(f) extern char f[];
HELPERS(DECLARE)

static const struct { const char *name; void *addr; } SYMS[] = {
  { "memcpy", memcpy }, { "memmove", memmove }, { "memset", memset }, { "memcmp", memcmp },
  { "strlen", strlen }, { "strcmp", strcmp }, { "strncmp", strncmp }, { "strchr", strchr }, { "strrchr", strrchr },
  { "strstr", strstr }, { "strcpy", strcpy }, { "strncpy", strncpy },
  { "strtol", strtol }, { "strtoul", strtoul }, { "strtod", strtod }, { "atoi", atoi },
  { "snprintf", snprintf }, { "vsnprintf", vsnprintf },
  { "malloc", m_malloc }, { "calloc", m_calloc }, { "realloc", m_realloc }, { "free", m_free },
#define ENTRY(f) { #f, f },
  HELPERS(ENTRY)
};

static uintptr_t resolve(const char *name) {
  for (size_t i = 0; i < sizeof SYMS / sizeof *SYMS; i++)
    if (!strcmp(SYMS[i].name, name)) return (uintptr_t)SYMS[i].addr;
  if (!missing[0]) snprintf(missing, sizeof missing, "%s", name);
  return 0;
}

// ---- what the kernel gives a module ---------------------------------------------------------------------------
static int64_t k_call(int op, int a, int b, int64_t c, const char *s0, size_t n0, const char *s1, size_t n1,
                      const char *s2, size_t n2, char *out, size_t out_n) {
  world_t *W = now;
  if (!W) return -1;
  if (n0 > NW_STR_MAX || n1 > NW_STR_MAX || n2 > NW_STR_MAX) {
    snprintf(W->nat->err, sizeof W->nat->err, "a string is longer than %d bytes", NW_STR_MAX);
    return -1;
  }
  nw_call_t k = { .op = op, .i = { a, b, (int32_t)c }, .v = c, .s = { s0, s1, s2 }, .n = { n0, n1, n2 } };
  // As the other backends do: the call writes here, the module gets what fits. Static, in internal RAM: made lazily
  // in PSRAM instead, the change in the internal layout alone made the kernel's JavaScript calibration loop (sums
  // that outgrow 32 bits and become floats) take 1604 ms instead of 113 on the board, while fib(20) did not change
  // (PICOCALC-NATIVE diary, step 7).
  static char text[NW_OUT_MAX];
  text[0] = 0;
  int64_t r = nat_syscall(W, &k, text, NW_OUT_MAX);
  if (r >= 0 && out && out_n) {
    size_t t = strlen(text), m = t < out_n - 1 ? t : out_n - 1;
    memcpy(out, text, m);
    out[m] = 0;
  }
  return r;
}

static int k_error(char *buf, size_t n) {
  if (!now || !n) return 0;
  size_t t = strlen(now->nat->err), m = t < n - 1 ? t : n - 1;
  memcpy(buf, now->nat->err, m);
  buf[m] = 0;
  return (int)m;
}

static const nw_elf_kernel KERNEL = { NW_ELF_ABI, k_call, k_error };

// ---- the backend ----------------------------------------------------------------------------------------------
static void elf_unload(world_t *W) {
  elf_t *x = W->nat->inst;
  if (!x) return;
  for (block_t *b = x->blocks; b; ) { block_t *n = b->next; port_heap_free(b); b = n; }
  esp_elf_deinit(&x->elf);
  free(x);
  W->nat->inst = NULL;
}

static int elf_load(world_t *W, char *why, size_t n) {
  const uint8_t *h = (const uint8_t *)W->source;
  if (W->source_len < 52 || memcmp(h, "\177ELF", 4)) { snprintf(why, n, "%s is not an ELF module", W->file); return -1; }
  uint16_t machine = h[18] | h[19] << 8;
  uint32_t flags = h[36] | h[37] << 8 | h[38] << 16 | (uint32_t)h[39] << 24;
  if (h[4] != 1 || machine != EM_RISCV || (flags & EF_RISCV_FLOAT_ABI) != EF_RISCV_FLOAT_ABI_SINGLE) {
    snprintf(why, n, "%s is not built for this board (32-bit RISC-V, ilp32f)", W->file);
    return -1;
  }
  elf_t *x = calloc(1, sizeof *x);
  if (!x) { snprintf(why, n, "out of memory"); return -1; }
  W->nat->inst = x;
  static bool resolver;
  if (!resolver) {
    elf_set_symbol_resolver(resolve);
    esp_log_level_set("ELF", ESP_LOG_WARN);   // its version and entry address, at every load; errors still show
    resolver = true;
  }
  esp_elf_init(&x->elf);
  missing[0] = 0;
  // the loader reads the image as 32-bit words: it must be aligned (port_read_file's copy is, but check)
  const uint8_t *img = h;
  uint8_t *copy = NULL;
  if ((uintptr_t)h & 3) {
    if (!(copy = malloc(W->source_len))) { snprintf(why, n, "out of memory"); goto fail; }
    memcpy(copy, h, W->source_len);
    img = copy;
  }
  int rc = esp_elf_relocate(&x->elf, img, W->source_len);
  free(copy);
  if (rc) {
    if (missing[0]) snprintf(why, n, "it links to %s, which picocalc-os does not give a module", missing);
    else snprintf(why, n, "%s could not be loaded (elf_loader error %d)", W->file, rc);
    goto fail;
  }
  if (x->elf.segment_size > W->mem_limit) {
    snprintf(why, n, "its code and data take %zu KB, more than the %zu KB its manifest entry gives it",
             (x->elf.segment_size + 1023) / 1024, W->mem_limit / 1024);
    goto fail;
  }
  char *argv[2] = { (char *)(void *)&KERNEL, (char *)(void *)&x->mod };
  world_t *was = now;
  now = W;
  esp_elf_request(&x->elf, 0, 2, argv);   // the module's entry fills in its table
  now = was;
  if (x->mod.abi != NW_ELF_ABI || !x->mod.init || !x->mod.event) {
    snprintf(why, n, "it has no module table (link it with sdk/nw_elf.c)");
    goto fail;
  }
  used(W, x);
  return 0;
fail:
  elf_unload(W);
  return -1;
}

static int elf_event(world_t *W, const nw_event_t *e) {
  elf_t *x = W->nat->inst;
  vtime_t t0 = port_clock();
  world_t *was = now;
  now = W;
  int r = NW_DONE;
  if (e->kind == NW_INIT) x->mod.init();
  else r = x->mod.event(e->kind, e->kind == NW_SETTLE ? e->ok : e->ask, e->timer, e->token, e->type, e->json, (int)e->json_len, e->from);
  now = was;
  vtime_t took = port_clock() - t0;
  K.seg_cost += took;
  if (K.trace) klog("%s: %lld us of machine code (event %d%s%s)", W->name, (long long)took, e->kind, e->type[0] ? ", " : "", e->type);
  if (took > W->nat->budget_us) { W->overrun = true; return -1; }
  if (r != NW_DONE && r != NW_LATER) { snprintf(W->last_error, sizeof W->last_error, "it broke the native protocol (an end of %d)", r); return -1; }
  return r;
}

static const native_backend_t ELF = { "elf", elf_load, elf_event, elf_unload };
const native_backend_t *elf_backend(void) { return &ELF; }
