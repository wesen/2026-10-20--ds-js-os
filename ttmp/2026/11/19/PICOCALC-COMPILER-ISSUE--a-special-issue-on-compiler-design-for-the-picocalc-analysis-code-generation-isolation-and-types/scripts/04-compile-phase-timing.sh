#!/bin/sh
# Usage (repository root): sh <this file> [path-to-typed-world-reactor.elf]
set -e
here=$(dirname "$0")
os=picocalc-os
out=${TMPDIR:-/tmp}/typed-phase-timing
cc -O2 -I $os/third_party/quickjs -o "$out" "$here/04-compile-phase-timing.c" $os/build/qjs/*.o -lm -lpthread
src=${TMPDIR:-/tmp}/typed-editor-source.typed
: > "$src"
while read -r name; do cat "$os/worlds/editor/$name" >> "$src"; echo >> "$src"; done < $os/worlds/editor/source.list
"$out" $os/compiler "$src" $os/build/typed-world-reactor.wasm "${1:--}" "$here/04-compile-phase-timing.js"
