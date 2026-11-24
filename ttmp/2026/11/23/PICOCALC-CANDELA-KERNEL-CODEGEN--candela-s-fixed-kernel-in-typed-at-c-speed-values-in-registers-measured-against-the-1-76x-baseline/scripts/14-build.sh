#!/bin/sh
# 14-build.sh: build 14-compile-heap.c with the vendored QuickJS into OUT/14-compile-heap (PICOCALC-CANDELA-KERNEL-CODEGEN).
# usage: 14-build.sh REPO OUT
# QuickJS gets the device's flags (-O2 -fwrapv -fno-strict-aliasing, CONFIG_VERSION from its VERSION file).
set -eu
REPO=$1; OUT=$2
HERE=$(cd "$(dirname "$0")" && pwd)
QJS=$REPO/firmware/third_party/quickjs
VER=$(cat "$QJS/VERSION")
mkdir -p "$OUT"
for s in quickjs libregexp libunicode cutils dtoa; do
  [ "$OUT/$s.o" -nt "$QJS/$s.c" ] || gcc -O2 -fwrapv -fno-strict-aliasing -w -D_GNU_SOURCE -DCONFIG_VERSION="\"$VER\"" -c "$QJS/$s.c" -o "$OUT/$s.o"
done
gcc -O2 -D_GNU_SOURCE -I"$QJS" -I"$REPO/firmware/port/esp32p4/main" -c "$REPO/firmware/port/esp32p4/main/typed_lex_index.c" -o "$OUT/typed_lex_index.o"
gcc -O2 -D_GNU_SOURCE -I"$QJS" -I"$REPO/firmware/port/esp32p4/main" -c "$HERE/14-compile-heap.c" -o "$OUT/14-compile-heap.o"
gcc -o "$OUT/14-compile-heap" "$OUT"/*.o -lm -lpthread
echo "built $OUT/14-compile-heap"
