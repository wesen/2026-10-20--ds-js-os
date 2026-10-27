# picocalc-os, host builds: the nucleus and a simulated board, on Linux.
#   make                  the PicoCalc (QuickJS, RGB565): build/picocalc-host
#   make BOARD=papers3    the M5Stack PaperS3 (MicroQuickJS, gray8, e-paper, touch): build-papers3/papers3-host
#   make M32=1            32-bit binary, so worlds use the memory they would on the device
#   make SAN=1            with AddressSanitizer and UBSan
#   make shots            run every script in scripts/ (scripts-papers3/ for the PaperS3) and write the captures
BOARD   ?= picocalc
CC      ?= gcc
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

ifeq ($(BOARD),papers3)
  BUILD   := build-papers3$(BUILD_SUFFIX)
  ENG     := third_party/mquickjs
  ENG_SRC := mquickjs.c dtoa.c libm.c cutils.c
  GEN     := $(BUILD)/gen
  CFLAGS  += -I$(GEN) -I$(ENG) -DBOARD_PAPERS3 -DNUCLEUS_GRAY8 -DNUCLEUS_FONT_HEADER='"font_paper.h"' -DMQJS_VERSION=\"$(shell cat $(ENG)/VERSION)\"
  OS_SRC  := nucleus/kernel.c nucleus/vm_mqjs.c nucleus/hw.c nucleus/gfx.c nucleus/png.c nucleus/util.c \
             sim/papers3/board.c sim/papers3/bus.c sim/papers3/epd.c sim/papers3/gt911.c sim/papers3/bm8563.c \
             host/port_host.c host/main_host.c
  HDRS    := nucleus/nucleus.h nucleus/font_paper.h sim/papers3/papers3.h host/board.h $(GEN)/mqjs_stdlib.h $(ENG)/mquickjs.h
  BIN     := $(BUILD)/papers3-host
  SCRIPTS := scripts-papers3
  JSROOT  := js-papers3
  OUT     := out-papers3
else
  BUILD   := $(if $(M32),build32,build)$(subst 32,,$(BUILD_SUFFIX))
  ENG     := third_party/quickjs
  ENG_SRC := quickjs.c libregexp.c libunicode.c cutils.c dtoa.c
  CFLAGS  += -I$(ENG) -DCONFIG_VERSION=\"2026-06-04\"
  OS_SRC  := nucleus/kernel.c nucleus/vm.c nucleus/hw.c nucleus/gfx.c nucleus/png.c nucleus/util.c \
             sim/st7365p.c sim/stm32kbd.c sim/board.c sim/bus_sim.c host/port_host.c host/main_host.c
  HDRS    := nucleus/nucleus.h nucleus/font_data.h sim/picocalc.h host/board.h
  BIN     := $(BUILD)/picocalc-host
  SCRIPTS := scripts
  JSROOT  := js
  OUT     := out
endif

ENG_OBJ := $(addprefix $(BUILD)/eng/,$(ENG_SRC:.c=.o))
OS_OBJ  := $(addprefix $(BUILD)/,$(OS_SRC:.c=.o))

all: $(BIN)

$(BIN): $(ENG_OBJ) $(OS_OBJ)
	$(CC) $(LDFLAGS) -o $@ $^ $(LDLIBS)

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
	@for s in $(SCRIPTS)/*.txt; do echo "== $$s"; ./$(BIN) -j $(JSROOT) -o $(OUT) $$s || exit 1; done

clean:
	rm -rf build build32 build-san build32-san build-papers3*

.PHONY: all shots clean
