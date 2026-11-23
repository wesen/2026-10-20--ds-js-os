/* rv32emu's parts (bench/emu): the machine's state and the interfaces between its files. main.c explains the
 * program; docs/rv32-executors.md gives its role next to the reference interpreter and pkg/tracerv32. */
#ifndef RV32EMU_MACHINE_H
#define RV32EMU_MACHINE_H
#define _GNU_SOURCE
#include <elf.h>
#include <math.h>
#include <setjmp.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MEM_SIZE (96u << 20)     /* guest memory: 96 MB at address 0 */
#define STACK_TOP (MEM_SIZE - 16)
#define HEAP_BASE (32u << 20)    /* the firmware's malloc arena: 32 MB .. 88 MB (CJI-4: 56 MB; malloc here neither */
#define HEAP_END (88u << 20)     /* splits nor joins blocks, and a compile on the board came within 1 MB of 24) */

typedef struct { char *name; uint32_t value; } sym;

/* machine.c: the registers, guest memory (MEM_SIZE bytes at address 0) and its accesses. die() prints and exits,
   unless die_jump is set: then it keeps the message in die_message and jumps there (rv32emu-vectors). */
extern uint8_t *mem;
extern uint32_t x[32], pc;
extern uint64_t steps;
extern struct watch { uint32_t b, e, peak; } watch[16];
extern int nwatch;
extern jmp_buf *die_jump;
extern char die_message[512];
void die(const char *fmt, ...) __attribute__((noreturn, format(printf, 1, 2)));
void watched(uint32_t a, uint32_t n);
/* (inline: every instruction fetch and access goes through these) */
static inline void check(uint32_t a, uint32_t n)
{
	if ((uint64_t)a + n > MEM_SIZE || a < 4096)
		die("access to %#x (pc %#x)", a, pc);
}
static inline uint32_t ld32(uint32_t a) { uint32_t v; check(a, 4); memcpy(&v, mem + a, 4); return v; }
static inline uint16_t ld16(uint32_t a) { uint16_t v; check(a, 2); memcpy(&v, mem + a, 2); return v; }
static inline uint8_t ld8(uint32_t a) { check(a, 1); return mem[a]; }
static inline void st32(uint32_t a, uint32_t v) { check(a, 4); memcpy(mem + a, &v, 4); if (nwatch) watched(a, 4); }
static inline void st16(uint32_t a, uint16_t v) { check(a, 2); memcpy(mem + a, &v, 2); if (nwatch) watched(a, 2); }
static inline void st8(uint32_t a, uint8_t v) { check(a, 1); mem[a] = v; if (nwatch) watched(a, 1); }
static inline uint64_t ld64(uint32_t a) { return ld32(a) | (uint64_t)ld32(a + 4) << 32; }
static inline void st64(uint32_t a, uint64_t v) { st32(a, (uint32_t)v); st32(a + 4, (uint32_t)(v >> 32)); }
static inline char *str(uint32_t a) { check(a, 1); return (char *)mem + a; }
/* host.c */
void hostcall(uint32_t n);
extern uint64_t hc_calls[128];
extern uint32_t hc_pc[128];
/* profile.c */
extern int tracing;
extern uint32_t *prof;
void add_func(const char *name, uint32_t at);
void profile_report(void);
const char *func_at(uint32_t at);
/* decode.c */
uint32_t expand_c(uint32_t c, uint32_t pc);
/* execute.c: one instruction, and instructions until the firmware exits */
void step(void);
void run(void) __attribute__((noreturn));
/* fpu.c: RV32F, its registers and fcsr */
extern uint32_t f[32], fcsr;
void fp_fused(uint32_t i);
int fp_op(uint32_t i, uint32_t a, uint32_t *v);
uint32_t fp_csr(uint32_t i, uint32_t a);
/* elf.c */
extern sym *fw_syms;
extern int nfw_syms;
uint32_t fw_sym(const char *name);
uint32_t module_sym(const char *name);
uint32_t load_firmware(const char *path, uint32_t *end);
uint32_t load_module(const char *path, uint32_t at);
uint32_t load_shared(const char *path, uint32_t at, uint32_t *entry, uint32_t *size);

#endif
