#!/usr/bin/env bash
# Run the professor's original 15-sample phase timer on the same pre-E source.
set -euo pipefail
work=$1
cpu=$2
out=$3
root=$(git rev-parse --show-toplevel)
src=$(cd "$(dirname "$0")" && pwd)
phase=("$root"/ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--*/scripts/04-compile-phase-timing.c)
mkdir -p "$out"
os="$root/picocalc-os"
sed '1i #include "01-typed-lex-index.h"' "${phase[0]}" |
    sed '/JSContext \*ctx = JS_NewContext(rt);/a\  if (!typed_lex_index_install(ctx)) return 3;' > "$out/timer.c"
cc -O2 -I "$os/third_party/quickjs" -I "$src" "$out/timer.c" "$src/01-typed-lex-index.c" \
    "$os"/build/qjs/*.o -lm -lpthread -o "$out/timer"
editor="$work/control/checkout/picocalc-os/worlds/editor"
while IFS= read -r part; do cat "$editor/$part"; echo; done < "$editor/source.list" > "$out/editor.typed"
for arm in control native-index-final native-index-reuse; do
    dir="$work/$arm/checkout/picocalc-os/compiler"
    taskset -c "$cpu" "$out/timer" "$dir" "$out/editor.typed" "$os/build/typed-world-reactor.wasm" - \
        "${phase[0]%.c}.js" > "$out/$arm.txt"
done
