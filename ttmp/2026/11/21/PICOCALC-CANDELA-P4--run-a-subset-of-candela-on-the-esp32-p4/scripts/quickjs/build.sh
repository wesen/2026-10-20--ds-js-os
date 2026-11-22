#!/bin/sh
# build.sh: compile the vendored QuickJS and candela-qjs.c into OUT/qjs64/candela-qjs and OUT/qjs32/candela-qjs.
# usage: build.sh REPO_ROOT OUT_DIR [64|32|both]
#
# QuickJS gets the device's flags (port/esp32p4/main/CMakeLists.txt; sdkconfig CONFIG_COMPILER_OPTIMIZATION_PERF
# means -O2): -O2 -fwrapv -fno-strict-aliasing -DCONFIG_VERSION="2026-06-04". Nothing is written under the repository.
#
# 32-bit: this host has 32-bit glibc runtime libraries (/usr/lib32/libc.so.6, libm.so.6, libgcc_s.so.1,
# ld-linux.so.2) but not libc6-dev-i386 (no crt1.o/crti.o, no libc_nonshared.a, no gnu/stubs-32.h). So the
# 32-bit link supplies the two missing pieces itself: an empty gnu/stubs-32.h and a minimal i386 _start
# (crt-i386.S) that calls __libc_start_main, then links the shared libraries by path with -nostdlib.
# -fno-stack-protector avoids __stack_chk_fail_local (it lives in libc_nonshared.a); -fno-pie/-no-pie keeps
# the start code simple. Neither changes how QuickJS lays out JSValues or objects.
# QuickJS objects are rebuilt only when older than their source (delete OUT_DIR to force a clean build).
set -eu
REPO=$1; OUT=$2; WHICH=${3:-both}
HERE=$(cd "$(dirname "$0")" && pwd)
QJS=$REPO/picocalc-os/third_party/quickjs
VER=$(cat "$QJS/VERSION")
SRCS="quickjs.c libregexp.c libunicode.c cutils.c dtoa.c"
QFLAGS="-O2 -fwrapv -fno-strict-aliasing -w -D_GNU_SOURCE -DCONFIG_VERSION=\"$VER\""

build64() {
  D=$OUT/qjs64; mkdir -p "$D"
  for s in $SRCS; do [ "$D/${s%.c}.o" -nt "$QJS/$s" ] || gcc $QFLAGS -c "$QJS/$s" -o "$D/${s%.c}.o"; done
  gcc -O2 -Wall -Wno-unused-parameter -D_GNU_SOURCE -DCONFIG_VERSION="\"$VER\"" -I"$QJS" -c "$HERE/candela-qjs.c" -o "$D/candela-qjs.o"
  gcc -o "$D/candela-qjs" "$D"/*.o -lm -lpthread
  echo "built $D/candela-qjs"
}

build32() {
  D=$OUT/qjs32; mkdir -p "$D/inc/gnu"
  : > "$D/inc/gnu/stubs-32.h"
  # gcc -m32 searches the i386 multiarch directory, which is absent; glibc's x86 bits/ headers in
  # /usr/include/x86_64-linux-gnu serve both word sizes, and gnu/stubs.h then asks for the stub above.
  # -msse2 -mfpmath=sse: IEEE double arithmetic, as RV32's soft-float doubles are; i386's default x87 code rounds
  # through 80-bit registers and changed packed scene data (and slowed float-heavy code) in a first trial.
  M32="-m32 -msse2 -mfpmath=sse -fno-pie -fno-stack-protector -isystem $D/inc -isystem /usr/include/x86_64-linux-gnu"
  for s in $SRCS; do [ "$D/${s%.c}.o" -nt "$QJS/$s" ] || gcc $M32 $QFLAGS -c "$QJS/$s" -o "$D/${s%.c}.o"; done
  gcc $M32 -O2 -Wall -Wno-unused-parameter -D_GNU_SOURCE -DCONFIG_VERSION="\"$VER\"" -I"$QJS" -c "$HERE/candela-qjs.c" -o "$D/candela-qjs.o"
  gcc -m32 -c "$HERE/crt-i386.S" -o "$D/crt-i386.o"
  gcc -m32 -no-pie -nostdlib -o "$D/candela-qjs" "$D/crt-i386.o" "$D"/quickjs.o "$D"/libregexp.o "$D"/libunicode.o "$D"/cutils.o "$D"/dtoa.o "$D"/candela-qjs.o \
    /usr/lib32/libm.so.6 /usr/lib32/libc.so.6 /usr/lib32/libgcc_s.so.1 -Wl,-dynamic-linker,/lib/ld-linux.so.2
  echo "built $D/candela-qjs"
}

case $WHICH in
  64) build64 ;;
  32) build32 ;;
  both) build64; build32 ;;
esac
