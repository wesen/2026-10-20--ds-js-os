#!/bin/sh
# Run the existing in-process QuickJS phase timer against frozen compiler revisions.
# Usage from the root: sh 03-time-quickjs.sh baseline e5-commit e7-commit
set -eu
[ "$#" -ge 2 ]
baseline=$1
os=picocalc-os
phase=$(find ttmp/2026/11/19 -path '*/PICOCALC-COMPILER-ISSUE--*/scripts/04-compile-phase-timing.c')
phase=${phase%.c}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cc -O2 -I "$os/third_party/quickjs" -o "$work/phase" "$phase.c" "$os"/build/qjs/*.o -lm -lpthread
git show "$baseline:$os/worlds/editor/source.list" | while IFS= read -r name; do
    git show "$baseline:$os/worlds/editor/$name"
    printf '\n'
done > "$work/editor.typed"
for rev in "$@"; do
    mkdir -p "$work/$rev"
    for file in typed-wasm.js typed-rv32.js typed-world.js; do
        git show "$rev:$os/compiler/$file" > "$work/$rev/$file"
    done
done
printf 'CPU\n'
lscpu | awk '/^Architecture:|^Model name:/'
printf 'Source and stock reactor revisions\n'
sha256sum "$work/editor.typed" "$os/build/typed-world-reactor.wasm"
for rev in "$@"; do
    printf '\nRevision %s\n' "$rev"
    "$work/phase" "$work/$rev" "$work/editor.typed" "$os/build/typed-world-reactor.wasm" - "$phase.js"
done
