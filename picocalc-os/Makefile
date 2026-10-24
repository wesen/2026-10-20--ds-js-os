# picocalc-os, host build: the nucleus and the simulated board, on Linux.
#   make            64-bit host binary (memory figures are scaled to the device's 32-bit sizes)
#   make M32=1      32-bit binary, so worlds use the memory they would on the ESP32-P4
#   make SAN=1      with AddressSanitizer and UBSan (build-san/)
#   make shots      run every script in scripts/ and write the captures to out/
CC      ?= gcc
QJS     := third_party/quickjs
CFLAGS  ?= -O2 -g
CFLAGS  += -Wall -Wno-unused-parameter -Wno-format-truncation -std=gnu11 -I$(QJS) -D_GNU_SOURCE -DCONFIG_VERSION=\"2026-06-04\"
LDLIBS  := -lm -lz -lpthread
ifeq ($(SAN),1)
  CFLAGS += -O1 -fsanitize=address,undefined -fno-omit-frame-pointer
  LDFLAGS += -fsanitize=address,undefined
  BUILD_SUFFIX := -san
endif
ifeq ($(M32),1)
  CFLAGS += -m32
  LDFLAGS += -m32
  BUILD := build32$(BUILD_SUFFIX)
else
  BUILD := build$(BUILD_SUFFIX)
endif

QJS_SRC := quickjs.c libregexp.c libunicode.c cutils.c dtoa.c
OS_SRC  := nucleus/kernel.c nucleus/vm.c nucleus/hw.c nucleus/gfx.c nucleus/png.c nucleus/util.c \
           sim/st7365p.c sim/stm32kbd.c sim/board.c sim/bus_sim.c host/port_host.c host/main_host.c
QJS_OBJ := $(addprefix $(BUILD)/qjs/,$(QJS_SRC:.c=.o))
OS_OBJ  := $(addprefix $(BUILD)/,$(OS_SRC:.c=.o))
BIN     := $(BUILD)/picocalc-host

all: $(BIN)

$(BIN): $(QJS_OBJ) $(OS_OBJ)
	$(CC) $(LDFLAGS) -o $@ $^ $(LDLIBS)

$(BUILD)/qjs/%.o: $(QJS)/%.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -w -c -o $@ $<

$(BUILD)/%.o: %.c nucleus/nucleus.h nucleus/font_data.h
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c -o $@ $<

shots: $(BIN)
	@mkdir -p out
	@for s in scripts/*.txt; do echo "== $$s"; ./$(BIN) $$s || exit 1; done

clean:
	rm -rf build build32 build-san build32-san

.PHONY: all shots clean
