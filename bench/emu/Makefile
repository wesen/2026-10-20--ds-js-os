# rv32emu, the RV32IMF emulator that runs the host replays, the Chess oracle and cji's tests, and the three objects
# the replays' programs link against (found next to the emulator): cji's freestanding C runtime (a small libc, the
# host-call stubs the emulator answers, soft-float helpers). That runtime lives in cji/tools/rv32/fw/ because the
# firmware's device-compiler tool links it too.
#
#   make -C bench/emu       builds build/rv32emu and build/{libc,hostcalls,softfloat}.o
CC      ?= cc
FW      := ../../cji/tools/rv32/fw
RVCLANG := clang --target=riscv32-unknown-elf -march=rv32imc -mabi=ilp32 -O2 -nostdinc \
	-isystem $(shell clang -print-resource-dir)/include -isystem $(FW)/include -fno-pic -mno-relax
OBJECTS := build/libc.o build/hostcalls.o build/softfloat.o

all: build/rv32emu $(OBJECTS)

build/rv32emu: emu.c Makefile
	mkdir -p build
	$(CC) -std=gnu11 -O2 -Wall -o $@ emu.c -lm

build/%.o: $(FW)/%.c Makefile $(wildcard $(FW)/include/*.h $(FW)/include/sys/*.h)
	mkdir -p build
	$(RVCLANG) -c $< -o $@

build/%.o: $(FW)/%.S Makefile
	mkdir -p build
	$(RVCLANG) -c $< -o $@

clean:
	rm -rf build
.PHONY: all clean
