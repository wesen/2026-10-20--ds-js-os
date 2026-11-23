#!/usr/bin/env python3
"""Split bench/emu/emu.c (886 lines) into the machine's parts, with no change to what it does.

usage: python3 01-split-emu.py [--apply]       (a dry run without --apply: prints the plan and the line counts)

  machine.h   the machine's state and the interfaces between the parts
  machine.c   guest memory, its loads and stores, the watched ranges, die
  host.c      the heap, printf and the host calls the firmware's library makes
  profile.c   RV32_TRACE and RV32_PROFILE: function names and the per-function report
  decode.c    the C extension: each 16-bit instruction as the 32-bit one it stands for
  execute.c   the processor: one instruction (step) and the loop (run)
  elf.c       loading the firmware, relocatable modules and shared modules
  main.c      the command line

Each part is a contiguous line range of emu.c, asserted by its first line; identifiers that cross parts lose their
`static`. emu.c is removed with git rm, and the Makefile builds rv32emu from the parts.
"""
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
EMU = REPO / "bench/emu"
apply = "--apply" in sys.argv
lines = (EMU / "emu.c").read_text().split("\n")
assert len(lines) == 887 and lines[-1] == "", len(lines)


def span(first, last, starts):
    """Lines first..last (1-based, inclusive); the first must start with `starts`."""
    assert lines[first - 1].startswith(starts), (first, lines[first - 1], starts)
    return lines[first - 1:last]


def unstatic(text, names):
    for name in names:
        pattern = re.compile(r"^static ((?:inline )?[\w ]+?\**)\b(" + re.escape(name) + r")\b", re.M)
        text, n = pattern.subn(r"\1\2", text)
        assert n >= 1, name
    return text


header_comment = span(1, 15, "/* Chapter 29")
includes = span(16, 24, "#define _GNU_SOURCE")
defines = span(26, 29, "#define MEM_SIZE")
state = span(31, 33, "static uint8_t *mem;")
assert lines[34] == "static void profile_report(void);"
memory = span(36, 69, "static void die(")
heap = span(71, 108, "/* ---- the heap")
printf = span(110, 178, "/* ---- printf")
host = span(180, 350, "/* ---- the calls the firmware")
assert lines[351] == "typedef struct { char *name; uint32_t value; } sym;"
profile = span(353, 395, "/* RV32_TRACE=1")
compressed = span(397, 490, "/* ---- the C extension")
processor = span(492, 606, "/* ---- the processor")
loading = span(608, 829, "/* ---- loading")
main = span(831, 886, "int main(")

H = "\n".join
parts = {}
parts["machine.h"] = H([
    "/* rv32emu's parts (bench/emu): the machine's state and the interfaces between its files. main.c explains the",
    " * program; docs/rv32-executors.md gives its role next to the reference interpreter and pkg/tracerv32. */",
    "#ifndef RV32EMU_MACHINE_H",
    "#define RV32EMU_MACHINE_H",
    *includes, "", *defines, "",
    "typedef struct { char *name; uint32_t value; } sym;",
    "",
    "/* machine.c: the registers, guest memory (MEM_SIZE bytes at address 0) and its accesses */",
    "extern uint8_t *mem;", "extern uint32_t x[32], pc;", "extern uint64_t steps;",
    "extern struct watch { uint32_t b, e, peak; } watch[16];", "extern int nwatch;",
    "void die(const char *fmt, ...) __attribute__((noreturn, format(printf, 1, 2)));",
    "void check(uint32_t a, uint32_t n);",
    "uint32_t ld32(uint32_t a);", "uint16_t ld16(uint32_t a);", "uint8_t ld8(uint32_t a);",
    "void st32(uint32_t a, uint32_t v);", "void st16(uint32_t a, uint16_t v);", "void st8(uint32_t a, uint8_t v);",
    "uint64_t ld64(uint32_t a);", "void st64(uint32_t a, uint64_t v);", "char *str(uint32_t a);",
    "/* host.c */", "void hostcall(uint32_t n);", "extern uint64_t hc_calls[128];", "extern uint32_t hc_pc[128];",
    "/* profile.c */", "extern int tracing;", "extern uint32_t *prof;", "void add_func(const char *name, uint32_t at);",
    "void profile_report(void);", "const char *func_at(uint32_t at);",
    "/* decode.c */", "uint32_t expand_c(uint32_t c, uint32_t pc);",
    "/* execute.c */", "void run(void) __attribute__((noreturn));",
    "/* elf.c */", "extern sym *fw_syms;", "extern int nfw_syms;", "uint32_t fw_sym(const char *name);",
    "uint32_t module_sym(const char *name);", "uint32_t load_firmware(const char *path, uint32_t *end);",
    "uint32_t load_module(const char *path, uint32_t at);",
    "uint32_t load_shared(const char *path, uint32_t at, uint32_t *entry, uint32_t *size);",
    "", "#endif", ""])

memory_text = H(memory).replace("static struct { uint32_t b, e, peak; } watch[16];", "struct watch watch[16];")
memory_text = unstatic(memory_text, ["die", "check", "ld32", "ld16", "ld8", "nwatch", "st32", "st16", "st8", "ld64", "st64", "str"])
parts["machine.c"] = H(["/* rv32emu: guest memory, its loads and stores, the watched ranges, die. */", '#include "machine.h"', "",
                        "uint8_t *mem;", "uint32_t x[32], pc;", "uint64_t steps;", "", memory_text, ""])

host_text = unstatic(H(host), ["hostcall", "hc_calls", "hc_pc"])
parts["host.c"] = H(["/* rv32emu: the heap the firmware's malloc hands out, printf, and the host calls the firmware's library makes. */",
                     '#include "machine.h"', "", *heap, "", *printf, "", host_text, ""])

profile_text = H(profile)
assert profile_text.count("static int nfuncs, funcs_cap, tracing;") == 1
profile_text = profile_text.replace("static int nfuncs, funcs_cap, tracing;", "static int nfuncs, funcs_cap;\nint tracing;")
profile_text = unstatic(profile_text, ["add_func", "prof", "profile_report", "func_at"])
parts["profile.c"] = H(["/* rv32emu: RV32_TRACE and RV32_PROFILE, the names of functions and the per-function report. */",
                        '#include "machine.h"', "", profile_text, ""])

parts["decode.c"] = H(['/* rv32emu: decoding. */', '#include "machine.h"', "",
                       unstatic(H(compressed), ["expand_c"]), ""])

processor_text = H(processor).replace("static void run(void)", "void run(void)")
parts["execute.c"] = H(["/* rv32emu: the processor. */", '#include "machine.h"', "", processor_text, ""])

parts["elf.c"] = H(["/* rv32emu: loading the firmware (an executable), a module (a relocatable object) and a shared module. */",
                    '#include "machine.h"', "",
                    unstatic(H(loading), ["fw_syms", "nfw_syms", "fw_sym", "module_sym", "load_firmware", "load_module",
                                          "load_shared"]), ""])

parts["main.c"] = H([*header_comment, '#include "machine.h"', "", *main, ""])

# Every line of emu.c is in exactly one part, apart from blank separators and the two lines the header replaces.
used = {1, 2, 3}
for a, b in [(1, 15), (16, 24), (26, 29), (31, 33), (35, 35), (36, 69), (71, 108), (110, 178), (180, 350), (352, 352),
             (353, 395), (397, 490), (492, 606), (608, 829), (831, 886)]:
    used |= set(range(a, b + 1))
unused = [i + 1 for i, l in enumerate(lines[:-1]) if i + 1 not in used and l.strip()]
assert not unused, unused

for name, text in parts.items():
    print(f"{name:12} {text.count(chr(10)):4} lines")
if not apply:
    print("dry run: pass --apply to write the parts and remove emu.c")
    sys.exit(0)
for name, text in parts.items():
    assert not (EMU / name).exists(), name
    (EMU / name).write_text(text)
subprocess.run(["git", "rm", "-q", "bench/emu/emu.c"], cwd=REPO, check=True)
mk = EMU / "Makefile"
s = mk.read_text()
old = "build/rv32emu: emu.c Makefile\n\tmkdir -p build\n\t$(CC) -std=gnu11 -O2 -Wall -o $@ emu.c -lm\n"
assert s.count(old) == 1
s = s.replace(old, "SOURCES := main.c machine.c host.c profile.c decode.c execute.c elf.c\n\n"
                   "build/rv32emu: $(SOURCES) machine.h Makefile\n\tmkdir -p build\n\t$(CC) -std=gnu11 -O2 -Wall -o $@ $(SOURCES) -lm\n")
mk.write_text(s)
print("bench/emu split; emu.c removed")
