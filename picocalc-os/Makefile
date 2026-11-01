# picocalc-os, host builds: the nucleus and a simulated board, on Linux.
#   make                  the PicoCalc (QuickJS, RGB565): build/picocalc-host
#   make BOARD=papers3    the M5Stack PaperS3 (MicroQuickJS, gray8, e-paper, touch): build-papers3/papers3-host
#   make M32=1            32-bit binary, so worlds use the memory they would on the device
#   make SAN=1            with AddressSanitizer and UBSan
#   make shots            run every script in scripts/ (scripts-papers3/ for the PaperS3) and write the captures
BOARD   ?= picocalc
CC      ?= gcc
NODE    ?= node
PYTHON  ?= python3
CFLAGS  ?= -O2 -g
CFLAGS  += -Wall -Wno-unused-parameter -Wno-format-truncation -std=gnu11 -D_GNU_SOURCE
LDLIBS  := -lm -lz -lpthread
ifeq ($(SAN),1)
  CFLAGS += -O1 -fsanitize=address,undefined -fno-omit-frame-pointer
  LDFLAGS += -fsanitize=address,undefined
  BUILD_SUFFIX := -san
endif
ifeq ($(M32),1)
  CFLAGS += -m32
  LDFLAGS += -m32
  BUILD_SUFFIX := 32$(BUILD_SUFFIX)
endif

# Explicitly opt in to real HTTPS. The default simulator remains offline and deterministic.
# A separate build directory prevents reusing objects compiled without libcurl support.
ifeq ($(AGENT_LIVE),1)
  CFLAGS += -DAGENT_LIVE
  LDLIBS += -lcurl
  BUILD_SUFFIX := $(BUILD_SUFFIX)-agent
endif

ifeq ($(BOARD),papers3)
  BUILD   := build-papers3$(BUILD_SUFFIX)
  ENG     := third_party/mquickjs
  ENG_SRC := mquickjs.c dtoa.c libm.c cutils.c
  GEN     := $(BUILD)/gen
  CFLAGS  += -I$(GEN) -I$(ENG) -DBOARD_PAPERS3 -DNUCLEUS_GRAY8 -DNUCLEUS_FONT_HEADER='"font_paper.h"' -DMQJS_VERSION=\"$(shell cat $(ENG)/VERSION)\"
  OS_SRC  := nucleus/kernel.c nucleus/vm_mqjs.c nucleus/hw.c nucleus/gfx.c nucleus/png.c nucleus/util.c nucleus/fs.c nucleus/native.c nucleus/native_wasm.c \
             sim/papers3/board.c sim/papers3/bus.c sim/papers3/epd.c sim/papers3/gt911.c sim/papers3/bm8563.c \
             host/port_host.c host/agent_host.c host/main_host.c host/native_proc.c
  HDRS    := nucleus/nucleus.h sdk/nw_wire.h nucleus/font_paper.h sim/papers3/papers3.h host/board.h $(GEN)/mqjs_stdlib.h $(ENG)/mquickjs.h
  BIN     := $(BUILD)/papers3-host
  SCRIPTS := scripts-papers3
  JSROOT  := js-papers3
  OUT     := out-papers3
else
  BUILD   := $(if $(M32),build32,build)$(subst 32,,$(BUILD_SUFFIX))
  ENG     := third_party/quickjs
  ENG_SRC := quickjs.c libregexp.c libunicode.c cutils.c dtoa.c
  CFLAGS  += -I$(ENG) -DCONFIG_VERSION=\"2026-06-04\"
  OS_SRC  := nucleus/kernel.c nucleus/vm.c nucleus/hw.c nucleus/gfx.c nucleus/png.c nucleus/util.c nucleus/fs.c nucleus/native.c nucleus/native_wasm.c \
             sim/st7365p.c sim/stm32kbd.c sim/board.c sim/bus_sim.c host/port_host.c host/agent_host.c host/net_host.c host/main_host.c host/native_proc.c
  HDRS    := nucleus/nucleus.h sdk/nw_wire.h nucleus/font_data.h sim/picocalc.h host/board.h
  BIN     := $(BUILD)/picocalc-host
  SCRIPTS := scripts
  JSROOT  := js
  OUT     := out
endif

ENG_OBJ := $(addprefix $(BUILD)/eng/,$(ENG_SRC:.c=.o))
OS_OBJ  := $(addprefix $(BUILD)/,$(OS_SRC:.c=.o))

# WebAssembly worlds (nucleus/native_wasm.c) run in WAMR's fast interpreter: a subset of WAMR 2.4.5 in third_party/wamr
# (tools/vendor-wamr.sh), configured as WAMR's own CMake would for these options: no AOT, JIT, WASI or libc-builtin;
# software bounds checks (no signal handlers in picocalc-host); instruction counting for the turn budget. x86-64 only,
# so not with M32=1, which builds without WebAssembly.
ifneq ($(M32),1)
  WAMR     := third_party/wamr/core
  WAMR_SRC := shared/platform/linux/platform_init.c \
              $(addprefix shared/platform/common/posix/posix_,blocking_op.c malloc.c memmap.c sleep.c thread.c time.c) \
              $(addprefix shared/mem-alloc/,mem_alloc.c ems/ems_alloc.c ems/ems_gc.c ems/ems_hmu.c ems/ems_kfc.c) \
              $(addprefix shared/utils/bh_,assert.c bitmap.c common.c hashmap.c leb128.c list.c log.c queue.c vector.c) \
              shared/utils/runtime_timer.c \
              $(addprefix iwasm/common/wasm_,application.c blocking_op.c c_api.c exec_env.c loader_common.c memory.c \
                native.c runtime_common.c shared_memory.c) \
              $(addprefix iwasm/interpreter/wasm_,interp_fast.c loader.c runtime.c)
  WAMR_DEF := -DBH_PLATFORM_LINUX -DBUILD_TARGET_X86_64 -DBH_MALLOC=wasm_runtime_malloc -DBH_FREE=wasm_runtime_free \
              -DWASM_ENABLE_INTERP=1 -DWASM_ENABLE_FAST_INTERP=1 -DWASM_ENABLE_MINI_LOADER=0 -DWASM_ENABLE_BULK_MEMORY=1 \
              -DWASM_ENABLE_REF_TYPES=1 -DWASM_ENABLE_INSTRUCTION_METERING=1 -DWASM_ENABLE_SHRUNK_MEMORY=1 \
              -DWASM_ENABLE_MULTI_MODULE=0 -DWASM_ENABLE_SHARED_MEMORY=0 -DWASM_ENABLE_EXTENDED_CONST_EXPR=0 \
              -DWASM_ENABLE_AOT_INTRINSICS=0 -DWASM_ENABLE_QUICK_AOT_ENTRY=0 -DWASM_HAVE_MREMAP=1 \
              -DWASM_DISABLE_HW_BOUND_CHECK=1 -DWASM_DISABLE_STACK_HW_BOUND_CHECK=1 -DWASM_DISABLE_WAKEUP_BLOCKING_OP=1 \
              -DWASM_DISABLE_WRITE_GS_BASE=0 -DNDEBUG
  WAMR_INC := $(addprefix -I$(WAMR)/,iwasm/include iwasm/common iwasm/interpreter shared/utils shared/mem-alloc \
              shared/platform/include shared/platform/linux)
  WAMR_OBJ := $(addprefix $(BUILD)/wamr/,$(WAMR_SRC:.c=.o)) $(BUILD)/wamr/invokeNative_em64.o
  CFLAGS   += -DNUCLEUS_WASM=1 -I$(WAMR)/iwasm/include
  # With SAN=1: WAMR loads and stores unaligned on x86 by design, and checks for native stack overflow by comparing the
  # address of a local with the thread's stack, which ASan's fake stacks (use-after-return detection) move elsewhere.
  ifeq ($(SAN),1)
    WAMR_DEF += -fno-sanitize=alignment --param asan-use-after-return=0
  endif
endif

all: $(BIN)

$(BIN): $(ENG_OBJ) $(OS_OBJ) $(WAMR_OBJ)
	$(CC) $(LDFLAGS) -o $@ $^ $(LDLIBS)

$(BUILD)/wamr/%.o: $(WAMR)/%.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -w $(WAMR_DEF) $(WAMR_INC) -c -o $@ $<

$(BUILD)/wamr/invokeNative_em64.o: $(WAMR)/iwasm/common/arch/invokeNative_em64.s
	@mkdir -p $(dir $@)
	$(CC) -c -Wa,--noexecstack -o $@ $<   # the file has no .note.GNU-stack: without this the whole binary gets an executable stack

$(BUILD)/eng/%.o: $(ENG)/%.c $(if $(GEN),$(GEN)/mqjs_stdlib.h $(ENG)/mquickjs.h)
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -w -fwrapv -fno-strict-aliasing -c -o $@ $<   # as upstream; see port/esp32p4/main/CMakeLists.txt

$(BUILD)/%.o: %.c $(HDRS)
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c -o $@ $<

# MicroQuickJS's standard library is a ROM table generated on the host, for the target's word size
$(GEN)/mqjs_stdlib.h: $(ENG)/nucleus_stdlib.c $(ENG)/mqjs_stdlib.c $(ENG)/mquickjs_build.c
	@mkdir -p $(GEN)
	$(CC) -O2 -w -I$(ENG) -o $(GEN)/stdlib-gen $(ENG)/nucleus_stdlib.c $(ENG)/mquickjs_build.c
	$(GEN)/stdlib-gen $(if $(M32),-m32) > $(GEN)/mqjs_stdlib.h 2>/dev/null
	$(GEN)/stdlib-gen $(if $(M32),-m32) -a > $(GEN)/mquickjs_atom.h 2>/dev/null

shots: $(BIN)
	@mkdir -p $(OUT)
	@for s in $(SCRIPTS)/*.txt; do echo "== $$s"; rm -rf $(BUILD)/fs && cp -r fs-seed $(BUILD)/fs && \
	  ./$(BIN) -j $(JSROOT) -o $(OUT) -f $(BUILD)/fs $$s || exit 1; done

# The editor's, calculator's, agenda's and system apps' logic in Node, each app in a VM with fakes for the kernel (no binary needed).
test-apps:
	$(NODE) tests/editor.test.mjs
	$(NODE) tests/calc.test.mjs
	$(NODE) tests/agenda.test.mjs
	$(NODE) tests/sysapps.test.mjs

# The wall clock through the host binary: clock.wall/set/zone, Date, -w and -z.
test-clock: $(BIN)
	PICOCALC_TEST_BINARY=$(BIN) $(PYTHON) tests/test_clock_native.py

# System services through the host binary: guarded channels, the log ring, the simulated network and time zone,
# and apps from storage (sys.spawn, sys.stop).
test-sys: $(BIN)
	PICOCALC_TEST_BINARY=$(BIN) $(PYTHON) tests/test_sys_native.py
	PICOCALC_TEST_BINARY=$(BIN) $(PYTHON) tests/test_loader_native.py

# Files through the host binary: claims, paths, rights, narrowing, passing and revoking handles (no device needed).
test-fs: $(BIN)
	PICOCALC_TEST_BINARY=$(BIN) $(PYTHON) tests/test_fs_native.py

# These tests make no provider API calls. The normal suite uses deterministic local fixtures.
test-agent: $(BIN)
	@test "$(BOARD)" = picocalc || { echo "The agent currently targets the PicoCalc QuickJS build"; exit 1; }
	$(NODE) tests/agent.test.mjs
	$(NODE) tests/chat-ui.test.mjs
	$(NODE) tests/compositor-auth.test.mjs
	$(PYTHON) tests/agent-integration.py --binary $(BIN)
	PICOCALC_TEST_BINARY=$(BIN) $(PYTHON) tests/test_agent_native.py

# Requires libcurl development headers, OpenSSL CLI, and permission to bind a localhost test socket.
# All TLS requests stay on loopback, with an explicitly trusted test certificate and a dummy token.
test-agent-live: $(BIN)
	@test "$(BOARD)" = picocalc || { echo "The agent currently targets the PicoCalc QuickJS build"; exit 1; }
	$(MAKE) AGENT_LIVE=1 all
	PICOCALC_TEST_BINARY=$(BIN) PICOCALC_TEST_LIVE_BINARY=$(if $(filter 1,$(AGENT_LIVE)),$(BUILD),$(BUILD)-agent)/picocalc-host $(PYTHON) tests/test_agent_native.py --live

# Native worlds (PICOCALC-NATIVE): the example binaries, each linked statically with the process runtime, and the tests
# that run them under the host's sandbox (a process with a seccomp filter; x86-64 only, so not with M32=1).
NW_SDK  := sdk/nw.h sdk/nw_wire.h sdk/nw_json.h sdk/nw_calls.inc sdk/nw_proc.c
NATIVES := $(BUILD)/natives/echo $(BUILD)/natives/probe $(BUILD)/natives/battery
natives: $(NATIVES)

$(BUILD)/natives/%: natives/%.c $(NW_SDK)
	@mkdir -p $(dir $@)
	$(CC) -O2 -Wall -static -Isdk -o $@ $< sdk/nw_proc.c

$(BUILD)/natives/%: natives/%.cc $(NW_SDK)
	@mkdir -p $(dir $@)
	$(CC) -O2 -Wall -Isdk -c -o $@-rt.o sdk/nw_proc.c
	$(CXX) -O2 -Wall -static -Isdk -o $@ $< $@-rt.o

# The same examples as WebAssembly modules, and the WebAssembly probes: clang 18 for wasm32-wasi with wasi-libc (and
# libc++ for C++), linked with the WebAssembly runtime (sdk/nw_wasm.c) as a reactor. The system's packages if they are
# installed, else tools/wasm-toolchain.sh's copy in build/wasm-toolchain. The shadow stack comes first in memory, so
# overflowing it traps instead of running into the module's data.
WASM_TC := $(CURDIR)/build/wasm-toolchain
ifneq ($(wildcard $(WASM_TC)/root),)
  WASM_ENV := PATH=$(WASM_TC)/root/usr/lib/llvm-18/bin:$$PATH
  WASM_SYS := --sysroot=$(WASM_TC)/root/usr -resource-dir $(WASM_TC)/res
else
  WASM_SYS := --sysroot=/usr
endif
WASM_FLAGS := --target=wasm32-wasi $(WASM_SYS) -O2 -Wall -Isdk
WASM_LINK  := -mexec-model=reactor -Wl,--stack-first -Wl,-z,stack-size=16384 -Wl,--strip-all
WASM_SDK   := sdk/nw.h sdk/nw_wire.h sdk/nw_json.h sdk/nw_calls.inc sdk/nw_wasm.c
WASMS      := $(BUILD)/natives/echo.wasm $(BUILD)/natives/battery.wasm $(BUILD)/natives/wprobe.wasm $(BUILD)/natives/wimport.wasm
wasm: $(WASMS)

$(BUILD)/natives/%.wasm: natives/%.c $(WASM_SDK)
	@mkdir -p $(dir $@)
	$(WASM_ENV) clang-18 $(WASM_FLAGS) $(WASM_LINK) -o $@ $< sdk/nw_wasm.c

$(BUILD)/natives/%.wasm: natives/%.cc $(WASM_SDK)
	@mkdir -p $(dir $@)
	$(WASM_ENV) clang-18 $(WASM_FLAGS) -c -o $@-rt.o sdk/nw_wasm.c
	$(WASM_ENV) clang++-18 $(WASM_FLAGS) $(WASM_LINK) -fno-exceptions -fno-rtti -o $@ $< $@-rt.o

test-native: $(BIN) natives $(if $(filter 1,$(M32)),,wasm)
	PICOCALC_TEST_BINARY=$(BIN) PICOCALC_NATIVES=$(BUILD)/natives $(PYTHON) tests/test_native_worlds.py

clean:
	rm -rf build build32 build-san build32-san build-agent build32-agent build-san-agent build32-san-agent build-papers3*

.PHONY: all shots clean test-agent test-agent-live test-fs test-apps test-clock test-sys test-native natives wasm
