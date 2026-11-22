/* microbench.c: instruction latencies and issue rates of the ESP32-P4 HP core, measured with mcycle.
 *
 * Each test is 256 copies of one instruction (or a short dependent pair) in inline assembly. In a latency
 * test every instruction depends on the previous one, so cycles / 256 is the latency; in a throughput test
 * the instructions are independent (four interleaved chains, or the same constant inputs every time).
 * Every test runs three times and reports the minimum, so the first run's instruction-cache misses drop
 * out. Output: "CKMICRO <name> <instructions> <cycles>" per test. */
#include <stdint.h>
#include <stdio.h>
#include "esp_cpu.h"

#define R256(s) ".rept 256\n" s "\n.endr\n"
#define T0() uint32_t t0 = esp_cpu_get_cycle_count()
#define T1() (esp_cpu_get_cycle_count() - t0)

static uint32_t best(uint32_t (*f)(void)) { uint32_t m = 0xffffffffu; for (int k = 0; k < 3; k++) { uint32_t c = f(); if (c < m) m = c; } return m; }

static uint32_t t_rdcycle(void) { T0(); return T1(); }
static uint32_t t_add(void) { uint32_t x = 1; T0(); asm volatile(R256("addi %0, %0, 1") : "+r"(x)); uint32_t c = T1(); asm volatile("" :: "r"(x)); return c; }
static uint32_t t_mul(void) { uint32_t x = 3, a = 0x10001; T0(); asm volatile(R256("mul %0, %0, %1") : "+r"(x) : "r"(a)); uint32_t c = T1(); asm volatile("" :: "r"(x)); return c; }
static uint32_t t_div(void) { int32_t x = 12345, a = 0x7fffffff; T0(); asm volatile(R256("div %0, %1, %0\naddi %0, %0, 7") : "+r"(x) : "r"(a)); uint32_t c = T1(); asm volatile("" :: "r"(x)); return c; }
static uint32_t t_lw(void) { static void *volatile cell; cell = (void *)&cell; void *p = (void *)&cell; T0(); asm volatile(R256("lw %0, 0(%0)") : "+r"(p)); uint32_t c = T1(); asm volatile("" :: "r"(p)); return c; }
static uint32_t t_fadd(void) { float x = 1.0f, a = 1e-7f; T0(); asm volatile(R256("fadd.s %0, %0, %1") : "+f"(x) : "f"(a)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
static uint32_t t_fmul(void) { float x = 1.2345f, a = 1.0000001f; T0(); asm volatile(R256("fmul.s %0, %0, %1") : "+f"(x) : "f"(a)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
static uint32_t t_fmadd(void) { float x = 1.2345f, a = 0.5f, b = 1.0f; T0(); asm volatile(R256("fmadd.s %0, %0, %1, %2") : "+f"(x) : "f"(a), "f"(b)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
static uint32_t t_fmin(void) { float x = 1.2345f, a = 2.0f; T0(); asm volatile(R256("fmin.s %0, %0, %1") : "+f"(x) : "f"(a)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
/* fdiv.s: generic operands (x = 1.7 / x alternates between two values with full mantissas) */
static uint32_t t_fdiv(void) { float x = 1.234567f, b = 1.7f; T0(); asm volatile(R256("fdiv.s %0, %1, %0") : "+f"(x) : "f"(b)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
/* fdiv.s with the dividend dependent (x = x / 1.0000001: a slowly shrinking, generic mantissa) */
static uint32_t t_fdiv_n(void) { float x = 1.234567f, b = 1.0000001f; T0(); asm volatile(R256("fdiv.s %0, %0, %1") : "+f"(x) : "f"(b)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
/* fdiv.s on 1 / 1 (does the unit finish early on trivial operands?) */
static uint32_t t_fdiv_1(void) { float x = 1.0f, b = 1.0f; T0(); asm volatile(R256("fdiv.s %0, %1, %0") : "+f"(x) : "f"(b)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
/* fdiv.s issue rate: independent divisions of constants */
static uint32_t t_fdiv_tp(void) { float x, a = 1.7f, b = 1.234567f; T0(); asm volatile(R256("fdiv.s %0, %1, %2") : "=&f"(x) : "f"(a), "f"(b)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
/* fdiv.s with two independent chains: overlap if the divider is pipelined or there are two */
static uint32_t t_fdiv_2(void) { float x = 1.234567f, y = 1.4142f, b = 1.7f; T0(); asm volatile(".rept 128\nfdiv.s %0, %2, %0\nfdiv.s %1, %2, %1\n.endr\n" : "+f"(x), "+f"(y) : "f"(b)); uint32_t c = T1(); asm volatile("" :: "f"(x), "f"(y)); return c; }
/* fsqrt.s latency: x = sqrt(x) + c (generic mantissas); report the pair, subtract fadd's latency */
static uint32_t t_fsqrt_add(void) { float x = 1.7f, a = 0.123456f; T0(); asm volatile(R256("fsqrt.s %0, %0\nfadd.s %0, %0, %1") : "+f"(x) : "f"(a)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
static uint32_t t_fsqrt_tp(void) { float x, a = 1.7f; T0(); asm volatile(R256("fsqrt.s %0, %1") : "=&f"(x) : "f"(a)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
/* fdiv.s followed by an independent integer add: does the core keep issuing while the divider works? */
static uint32_t t_fdiv_overlap(void) { float x = 1.234567f, b = 1.7f; uint32_t k = 0; T0();
  asm volatile(R256("fdiv.s %0, %2, %0\naddi %1, %1, 1\naddi %1, %1, 1\naddi %1, %1, 1\naddi %1, %1, 1\naddi %1, %1, 1\naddi %1, %1, 1\naddi %1, %1, 1\naddi %1, %1, 1") : "+f"(x), "+r"(k) : "f"(b));
  uint32_t c = T1(); asm volatile("" :: "f"(x), "r"(k)); return c; }
/* float <-> int conversion round trip (what floor through conversion costs) */
static uint32_t t_fcvt(void) { float x = 1234.5f; int32_t t; T0(); asm volatile(R256("fcvt.w.s %1, %0, rtz\nfcvt.s.w %0, %1") : "+f"(x), "=&r"(t)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
/* flw load-to-use: a float loaded from the stack feeds an fadd that feeds the next store address? keep simple:
   dependent flw through fmv.x.w addressing is not expressible; measure flw issue rate instead */
static uint32_t t_flw_tp(void) { static float v[4] = {1, 2, 3, 4}; float x; const float *p = v; T0(); asm volatile(R256("flw %0, 0(%1)") : "=&f"(x) : "r"(p)); uint32_t c = T1(); asm volatile("" :: "f"(x)); return c; }
static uint32_t t_branch(void) { uint32_t x = 0; T0(); asm volatile(R256("beqz %0, 1f\n1:") : : "r"(x)); return T1(); }

void cdl_microbench(void) {
  static const struct { const char *name; uint32_t (*f)(void); int n; } T[] = {
    {"rdcycle-pair", t_rdcycle, 0}, {"add", t_add, 256}, {"mul", t_mul, 256}, {"div+addi", t_div, 512}, {"lw-chain", t_lw, 256},
    {"fadd.s", t_fadd, 256}, {"fmul.s", t_fmul, 256}, {"fmadd.s", t_fmadd, 256}, {"fmin.s", t_fmin, 256},
    {"fdiv.s", t_fdiv, 256}, {"fdiv.s-dividend", t_fdiv_n, 256}, {"fdiv.s-1/1", t_fdiv_1, 256}, {"fdiv.s-indep", t_fdiv_tp, 256},
    {"fdiv.s-2chains", t_fdiv_2, 256}, {"fsqrt.s+fadd.s", t_fsqrt_add, 512}, {"fsqrt.s-indep", t_fsqrt_tp, 256},
    {"fdiv.s+8addi", t_fdiv_overlap, 2304}, {"fcvt.w.s+fcvt.s.w", t_fcvt, 512}, {"flw-indep", t_flw_tp, 256}, {"beqz-taken", t_branch, 256},
  };
  for (unsigned k = 0; k < sizeof T / sizeof T[0]; k++) printf("CKMICRO %s %d %lu\n", T[k].name, T[k].n, (unsigned long)best(T[k].f));
}
