# Builds slas, the SLIR assembler. SLJIT is compiled with its argument checks on, so a
# malformed instruction from the compiler is reported instead of producing bad code.
CC      ?= cc
CFLAGS  ?= -std=c11 -O2 -g -Wall -Wextra
SLJIT   := runtime/sljit
DEFS    := -DSLJIT_CONFIG_AUTO=1 -DSLJIT_VERBOSE=1 -DSLJIT_ARGUMENT_CHECKS=1

slas: runtime/slas.c runtime/runtime.c runtime/runtime.h runtime/casemap.h runtime/idtable.h $(SLJIT)/sljitLir.c $(wildcard $(SLJIT)/*.h)
	$(CC) $(CFLAGS) $(DEFS) -I$(SLJIT) runtime/slas.c runtime/runtime.c $(SLJIT)/sljitLir.c -o $@ -lm

test: slas
	node run-tests.js

clean:
	rm -rf slas slas-rv32 build

.PHONY: test clean

# Chapter 29: rv32. slas-rv32 is slas built here with SLJIT's 32-bit RISC-V backend (it writes objects
# for the ESP32-P4; nothing it makes runs on this machine). The test machine is tools/rv32: an RV32IM
# emulator, and a firmware made of the C runtime and a small C library, built for rv32 by clang as
# picocalc-os's build would build it.
RV32    := build/rv32
RVSLJIT := -DSLJIT_CONFIG_RISCV_32=1 -DSLJIT_CONFIG_RISCV_COMPRESSED=200 -DSLJIT_EXECUTABLE_ALLOCATOR=0 -DSLJIT_IS_FPU_AVAILABLE=0 -DSLJIT_VERBOSE=1 -DSLJIT_ARGUMENT_CHECKS=1 -include runtime/rv32_exec.h
RVCLANG := clang --target=riscv32-unknown-elf -march=rv32imc -mabi=ilp32 -O2 -nostdinc \
	-isystem $(shell clang -print-resource-dir)/include -isystem tools/rv32/fw/include -Iruntime -fno-pic -mno-relax

rv32: slas-rv32 $(RV32)/rv32emu $(RV32)/fw-test.elf

slas-rv32: Makefile runtime/slas.c runtime/rv32.c runtime/rv32_obj.c runtime/rv32_mod.c runtime/cji_elf.h runtime/rv32_exec.h runtime/runtime.c runtime/runtime.h $(SLJIT)/sljitLir.c $(wildcard $(SLJIT)/*.h $(SLJIT)/*RISCV*.c)
	mkdir -p $(RV32)
	$(CC) -std=gnu11 -O2 -g -w $(RVSLJIT) -DCJI_RV32 -I$(SLJIT) -Iruntime -c runtime/slas.c -o $(RV32)/slas.o
	$(CC) -std=gnu11 -O2 -g -w $(RVSLJIT) -I$(SLJIT) -c $(SLJIT)/sljitLir.c -o $(RV32)/sljitLir.o
	$(CC) -std=gnu11 -O2 -g -Iruntime -c runtime/runtime.c -o $(RV32)/runtime-host.o
	$(CC) -o $@ $(RV32)/slas.o $(RV32)/sljitLir.o $(RV32)/runtime-host.o -lm

$(RV32)/rv32emu: ../../bench/emu/emu.c
	mkdir -p $(RV32)
	$(CC) -std=gnu11 -O2 -Wall -o $@ $< -lm

# CJI-4 part 2: every test firmware runs the soft-float and 64-bit integer helpers (and floor, ceil, trunc, round,
# fabs) as code, tools/rv32/fw/softfloat.c, as the board's libgcc does; hostcalls.S's stubs for them are weak, so a
# firmware linked without softfloat.o answers them by host call (ttmp/CJI-4-worlds-on-the-board/scripts/softfloat-both.sh).
FWLIB := $(RV32)/libc.o $(RV32)/hostcalls.o $(RV32)/softfloat.o

$(RV32)/fw-test.elf: Makefile runtime/runtime.c runtime/runtime.h runtime/cji_elf.h tools/rv32/fw/libc.c tools/rv32/fw/main.c tools/rv32/fw/hostcalls.S tools/rv32/fw/softfloat.c $(wildcard tools/rv32/fw/include/*.h)
	mkdir -p $(RV32)
	$(RVCLANG) -c runtime/runtime.c -o $(RV32)/runtime.o
	$(RVCLANG) -c tools/rv32/fw/libc.c -o $(RV32)/libc.o
	$(RVCLANG) -c tools/rv32/fw/main.c -o $(RV32)/main.o
	$(RVCLANG) -c tools/rv32/fw/hostcalls.S -o $(RV32)/hostcalls.o
	$(RVCLANG) -c tools/rv32/fw/softfloat.c -o $(RV32)/softfloat.o
	ld.lld -m elf32lriscv --no-relax -Ttext=0x10000 -e _start -o $@ $(RV32)/main.o $(RV32)/runtime.o $(FWLIB)

.PHONY: rv32

# CJI-4 (chapter 30): worlds as the board's modules (slas-rv32 -c NAME.so --module). fw-nw.elf is the test
# firmware for them: the runtime, the glue a module's entries reach (runtime/cji_elf.c), a fake kernel that
# speaks picocalc-os's sdk/nw_elf.h (tools/rv32/fw/nw_main.c, printing as tools/nw_fake.c does), and the
# table of names a module may link to (tools/rv32/resolve-table.mjs), which the emulator's loader searches
# as the board's resolve() would. picocalc-os's sdk headers come from its checkout (read only).
PICOCALC ?= $(CURDIR)/../../picocalc-os
NWFLAGS := -I$(PICOCALC)/sdk -Itools
NATIVE_ELF := $(PICOCALC)/port/esp32p4/optional/native_elf/native_elf_p4.c
# a module's malloc and the rest are the kernel's charging allocator (as native_elf_p4.c maps them to m_malloc)
FK_ALLOC := --map malloc=fk_malloc calloc=fk_calloc realloc=fk_realloc free=fk_free

rv32-nw: rv32 $(RV32)/fw-nw.elf

$(RV32)/cji_elf.o: runtime/cji_elf.c runtime/cji_elf.h runtime/runtime.h Makefile
	mkdir -p $(RV32)
	$(RVCLANG) $(NWFLAGS) -c runtime/cji_elf.c -o $@

$(RV32)/nw_main.o: tools/rv32/fw/nw_main.c tools/nw_fake_calls.inc runtime/nw_kernel_call.inc Makefile
	mkdir -p $(RV32)
	$(RVCLANG) $(NWFLAGS) -c tools/rv32/fw/nw_main.c -o $@

$(RV32)/resolve.c: tools/rv32/resolve-table.mjs $(RV32)/fw-test.elf $(RV32)/cji_elf.o $(RV32)/nw_main.o $(NATIVE_ELF)
	node tools/rv32/resolve-table.mjs --board $(NATIVE_ELF) --lib $(RV32)/libc.o $(RV32)/hostcalls.o \
		--cji $(RV32)/runtime.o $(RV32)/cji_elf.o $(FK_ALLOC) > $@

$(RV32)/fw-nw.elf: $(RV32)/fw-test.elf $(RV32)/cji_elf.o $(RV32)/nw_main.o $(RV32)/resolve.c
	$(RVCLANG) -c $(RV32)/resolve.c -o $(RV32)/resolve.o
	ld.lld -m elf32lriscv --no-relax -Ttext=0x10000 -e _start -o $@ $(RV32)/nw_main.o $(RV32)/cji_elf.o $(RV32)/runtime.o \
		$(FWLIB) $(RV32)/resolve.o

.PHONY: rv32-nw

# CJI-4 (chapter 30): the world runtime's unit in the firmware (chapter 32: with units, the shared unit is the
# runtime's unit itself, built with the firmware). slas-rv32 assembles it (--lib, with its export list), the test
# firmware links it as the board's firmware build would, and its exports join the table modules link against.
# fw-nw-units-noswap.elf is the control: the glue without its swap of the runtime's state.
UNIT := $(RV32)/unit

$(UNIT)/prelude-unit.slir: cji.js $(wildcard src/*.js)
	mkdir -p $(UNIT)
	node cji.js - --prelude-unit --emit < /dev/null > $@

$(UNIT)/unit.o: $(UNIT)/prelude-unit.slir slas-rv32 tools/rv32/unit.mjs tools/link-units.mjs
	node tools/rv32/unit.mjs slir $< > $(UNIT)/unit.slir
	./slas-rv32 -c $@ --lib $(UNIT)/unit.list $(UNIT)/unit.slir
	node tools/rv32/unit.mjs ilp32 $@ $(UNIT)/unit-ilp32.o

$(RV32)/resolve-units.c: tools/rv32/resolve-table.mjs $(RV32)/fw-test.elf $(RV32)/cji_elf.o $(UNIT)/unit.o $(NATIVE_ELF)
	node tools/rv32/resolve-table.mjs --board $(NATIVE_ELF) --lib $(RV32)/libc.o $(RV32)/hostcalls.o \
		--cji $(RV32)/runtime.o $(RV32)/cji_elf.o $(UNIT)/unit.o $(FK_ALLOC) > $@

$(RV32)/fw-nw-units.elf: $(RV32)/fw-nw.elf $(RV32)/resolve-units.c
	$(RVCLANG) -c $(RV32)/resolve-units.c -o $(RV32)/resolve-units.o
	ld.lld -m elf32lriscv --no-relax -Ttext=0x10000 -e _start -o $@ $(RV32)/nw_main.o $(RV32)/cji_elf.o $(RV32)/runtime.o \
		$(FWLIB) $(UNIT)/unit-ilp32.o $(RV32)/resolve-units.o

$(RV32)/fw-nw-units-noswap.elf: $(RV32)/fw-nw-units.elf runtime/cji_elf.c
	$(RVCLANG) $(NWFLAGS) -DCJI_ELF_NO_SWAP -c runtime/cji_elf.c -o $(RV32)/cji_elf_noswap.o
	ld.lld -m elf32lriscv --no-relax -Ttext=0x10000 -e _start -o $@ $(RV32)/nw_main.o $(RV32)/cji_elf_noswap.o $(RV32)/runtime.o \
		$(FWLIB) $(UNIT)/unit-ilp32.o $(RV32)/resolve-units.o

rv32-nw-units: rv32-nw $(RV32)/fw-nw-units.elf $(RV32)/fw-nw-units-noswap.elf

.PHONY: rv32-nw-units

# CJI-4, part 2 (compiling on the board): stage 1, the compiler compiled by cji (CJI-3), in a test firmware. Its SLIR
# comes from stage 0 (Node running cji on the bundle: minutes, and gigabytes of Node's heap), then slas-rv32 assembles
# it (its largest root-stack frame is 2,832 bytes: the firmware keeps a 4 KB slack, tools/rv32/fw/stage1_main.c).
STAGE1 := $(RV32)/stage1

$(STAGE1)/stage1.slir: cji.js $(wildcard src/*.js) tools/bundle.mjs
	mkdir -p $(STAGE1)
	nice -n 10 node tools/bundle.mjs --target cji -o $(STAGE1)/bundle-cji.js
	nice -n 10 node --max-old-space-size=6000 --stack-size=4000 cji.js $(STAGE1)/bundle-cji.js --emit > $@.tmp && mv $@.tmp $@

$(STAGE1)/stage1-ilp32.o: $(STAGE1)/stage1.slir slas-rv32 tools/rv32/unit.mjs
	./slas-rv32 -S --rootstack-slack 4096 -c $(STAGE1)/stage1-rv32.o $(STAGE1)/stage1.slir
	node tools/rv32/unit.mjs ilp32 $(STAGE1)/stage1-rv32.o $@

$(RV32)/stage1_main.o: tools/rv32/fw/stage1_main.c runtime/runtime.h Makefile
	$(RVCLANG) -c tools/rv32/fw/stage1_main.c -o $@

$(RV32)/fw-stage1.elf: $(RV32)/fw-test.elf $(RV32)/stage1_main.o $(STAGE1)/stage1-ilp32.o
	ld.lld -m elf32lriscv --no-relax -Ttext=0x10000 -e _start -o $@ $(RV32)/stage1_main.o $(STAGE1)/stage1-ilp32.o \
		$(RV32)/runtime.o $(FWLIB)

rv32-stage1: rv32 $(RV32)/fw-stage1.elf

.PHONY: rv32-stage1

# CJI-4, part 2: a world compiled on the board. fw-board.elf is the firmware of fw-nw-units.elf (the runtime, the glue,
# the world runtime's unit, the fake kernel) with the compiler in it: stage 1 (its cji_error_shape renamed, since the
# unit has one too), the unit's list as data, slas built for rv32 (its malloc a region of its own, freed when it returns:
# tools/rv32/fw/board_slas.c; its code buffer plain memory: tools/rv32/fw/board_exec.h), and a loader for a module in
# memory (tools/rv32/fw/elf_load.c). tools/rv32/fw/board_main.c compiles a world's source, assembles the module into
# memory, loads it and runs it with the fake kernel (tools/rv32/nw-test.sh BOARD=1). slas's <elf.h> is the host's
# (glibc's declarations, without its feature macros: build/rv32/board/inc/elf.h).
BOARD := $(RV32)/board
BOARDCC := $(RVCLANG) -isystem $(BOARD)/inc
BOARD_SLJIT := -DSLJIT_CONFIG_RISCV_32=1 -DSLJIT_CONFIG_RISCV_COMPRESSED=200 -DSLJIT_EXECUTABLE_ALLOCATOR=0 \
	-DSLJIT_UTIL_STACK=0 -DSLJIT_IS_FPU_AVAILABLE=0 -DSLJIT_ARGUMENT_CHECKS=1 -include tools/rv32/fw/board_exec.h
BOARD_REGION := -Dmalloc=slas_region_malloc -Dcalloc=slas_region_calloc -Drealloc=slas_region_realloc \
	-Dfree=slas_region_free -Dstrdup=slas_region_strdup -Dexit=slas_region_exit

$(BOARD)/inc/elf.h: /usr/include/elf.h
	mkdir -p $(BOARD)/inc
	sed -e '/#include <features.h>/d' -e 's/^__BEGIN_DECLS$$//' -e 's/^__END_DECLS$$//' $< > $@

$(BOARD)/slas.o: Makefile runtime/slas.c runtime/rv32.c runtime/rv32_obj.c runtime/rv32_mod.c runtime/cji_elf.h runtime/runtime.h \
		tools/rv32/fw/board_exec.h $(BOARD)/inc/elf.h $(wildcard tools/rv32/fw/include/*.h tools/rv32/fw/include/sys/*.h)
	$(BOARDCC) -w $(BOARD_SLJIT) $(BOARD_REGION) -DCJI_RV32 -DCJI_BOARD -Dmain=slas_main -Derror_shape=slas_error_shape \
		-I$(SLJIT) -c runtime/slas.c -o $@

$(BOARD)/sljitLir.o: Makefile $(SLJIT)/sljitLir.c $(wildcard $(SLJIT)/*.h $(SLJIT)/*RISCV*.c) tools/rv32/fw/board_exec.h
	mkdir -p $(BOARD)
	$(BOARDCC) -w $(BOARD_SLJIT) $(BOARD_REGION) -I$(SLJIT) -c $(SLJIT)/sljitLir.c -o $@

$(BOARD)/stage1.o: $(STAGE1)/stage1-ilp32.o   # (and a name for its code, for the emulator's profile: RV32_PROFILE=1)
	mkdir -p $(BOARD)
	llvm-objcopy --redefine-sym cji_error_shape=cji_stage1_error_shape --add-symbol cji_stage1_code=.text:0,global,function $< $@

$(BOARD)/unit_list.o: $(UNIT)/unit.o tools/rv32/unit.mjs
	mkdir -p $(BOARD)
	node tools/rv32/unit.mjs c $(UNIT)/unit.list cji_unit_list > $(BOARD)/unit_list.c
	$(RVCLANG) -c $(BOARD)/unit_list.c -o $@

$(BOARD)/board_main.o: Makefile tools/rv32/fw/board_main.c tools/rv32/fw/nw_main.c tools/nw_fake_calls.inc runtime/nw_kernel_call.inc runtime/runtime.h
	mkdir -p $(BOARD)
	$(RVCLANG) $(NWFLAGS) -Itools/rv32/fw -c tools/rv32/fw/board_main.c -o $@

$(BOARD)/board_slas.o: tools/rv32/fw/board_slas.c
	mkdir -p $(BOARD)
	$(RVCLANG) -c $< -o $@

$(BOARD)/elf_load.o: tools/rv32/fw/elf_load.c $(BOARD)/inc/elf.h
	$(BOARDCC) -c $< -o $@

$(RV32)/fw-board.elf: $(RV32)/fw-nw-units.elf $(BOARD)/board_main.o $(BOARD)/board_slas.o $(BOARD)/elf_load.o $(BOARD)/slas.o \
		$(BOARD)/sljitLir.o $(BOARD)/stage1.o $(BOARD)/unit_list.o
	ld.lld -m elf32lriscv --no-relax -Ttext=0x10000 -e _start -o $@ $(BOARD)/board_main.o $(BOARD)/board_slas.o $(BOARD)/elf_load.o $(RV32)/cji_elf.o \
		$(BOARD)/slas.o $(BOARD)/sljitLir.o $(BOARD)/stage1.o $(UNIT)/unit-ilp32.o $(BOARD)/unit_list.o $(RV32)/runtime.o \
		$(FWLIB) $(RV32)/resolve-units.o

rv32-board: rv32-nw-units $(STAGE1)/stage1-ilp32.o $(RV32)/fw-board.elf

.PHONY: rv32-board
