/* rv32emu's parts (bench/emu): the machine's state and the interfaces between its files. main.c explains the
 * program; docs/rv32-executors.md gives its role next to the reference interpreter and pkg/tracerv32. */
#ifndef RV32EMU_MACHINE_H
#define RV32EMU_MACHINE_H
#define _GNU_SOURCE
#include <elf.h>
#include <math.h>
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

/* machine.c: the registers, guest memory (MEM_SIZE bytes at address 0) and its accesses */
extern uint8_t *mem;
extern uint32_t x[32], pc;
extern uint64_t steps;
extern struct watch { uint32_t b, e, peak; } watch[16];
extern int nwatch;
void die(const char *fmt, ...) __attribute__((noreturn, format(printf, 1, 2)));
void check(uint32_t a, uint32_t n);
uint32_t ld32(uint32_t a);
uint16_t ld16(uint32_t a);
uint8_t ld8(uint32_t a);
void st32(uint32_t a, uint32_t v);
void st16(uint32_t a, uint16_t v);
void st8(uint32_t a, uint8_t v);
uint64_t ld64(uint32_t a);
void st64(uint32_t a, uint64_t v);
char *str(uint32_t a);
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
/* execute.c */
void run(void) __attribute__((noreturn));
/* elf.c */
extern sym *fw_syms;
extern int nfw_syms;
uint32_t fw_sym(const char *name);
uint32_t module_sym(const char *name);
uint32_t load_firmware(const char *path, uint32_t *end);
uint32_t load_module(const char *path, uint32_t at);
uint32_t load_shared(const char *path, uint32_t at, uint32_t *entry, uint32_t *size);

#endif
