# rv32emu, the RV32IMF emulator that runs the host replays, the Chess oracle and cji's tests, and its minimal C
# runtime: a small libc, the host-call stubs the emulator answers, and soft-float helpers (fw/). Programs that run on
# the emulator link against build/{libc,hostcalls,softfloat}.o, which the replays find next to the emulator.
#
#   make -C bench/emu       builds build/rv32emu and build/{libc,hostcalls,softfloat}.o
CC      ?= cc
RVCLANG := clang --target=riscv32-unknown-elf -march=rv32imc -mabi=ilp32 -O2 -nostdinc \
	-isystem $(shell clang -print-resource-dir)/include -isystem fw/include -fno-pic -mno-relax
OBJECTS := build/libc.o build/hostcalls.o build/softfloat.o

all: build/rv32emu $(OBJECTS)

build/rv32emu: emu.c Makefile
	mkdir -p build
	$(CC) -std=gnu11 -O2 -Wall -o $@ emu.c -lm

build/%.o: fw/%.c Makefile $(wildcard fw/include/*.h fw/include/sys/*.h)
	mkdir -p build
	$(RVCLANG) -c $< -o $@

build/%.o: fw/%.S Makefile
	mkdir -p build
	$(RVCLANG) -c $< -o $@

clean:
	rm -rf build
.PHONY: all clean
