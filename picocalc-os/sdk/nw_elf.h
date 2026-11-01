// The ABI between picocalc-os on a board and a native world loaded as machine code: an ELF module (a position-
// independent shared object) that Espressif's elf_loader relocates into memory, linked with sdk/nw_elf.c. The loader
// calls the module's entry, app_main(2, argv), once: argv[0] is the kernel's table, argv[1] the module's, which the
// entry fills in. Everything after that is a function call through the two tables, on the kernel's task.
//
// Only primitive types cross: this header is shared by the kernel (nucleus.h) and the module (nw.h), whose event
// structures differ.
#pragma once
#include <stddef.h>
#include <stdint.h>

#define NW_ELF_ABI 1

typedef struct nw_elf_kernel {
  int abi;   // NW_ELF_ABI
  // One system call: the arguments of the wire's CALL frame (nw_wire.h). Text results go to out, at most out_n - 1
  // bytes and a NUL. A result >= 0 is success; a negative one is a failure, and error() says why.
  int64_t (*call)(int op, int a, int b, int64_t c, const char *s0, size_t n0, const char *s1, size_t n1,
                  const char *s2, size_t n2, char *out, size_t out_n);
  int (*error)(char *buf, size_t n);
} nw_elf_kernel;

typedef struct nw_elf_module {
  int abi;   // NW_ELF_ABI, set by the entry
  void (*init)(void);
  // One event: kind as nw.h numbers them; second is ask for a message and ok for a settle. The strings are
  // NUL-terminated and stay put until the handler returns. Returns 0 (done) or 1 (it answers later).
  int (*event)(int kind, int second, int timer, int token, const char *type, const char *json, int json_len, const char *from);
} nw_elf_module;
