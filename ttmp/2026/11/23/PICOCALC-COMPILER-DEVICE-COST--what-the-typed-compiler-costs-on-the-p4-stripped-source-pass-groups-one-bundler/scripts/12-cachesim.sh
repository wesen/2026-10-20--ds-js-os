#!/usr/bin/env bash
# Callgrind's cache simulation (P4-like: I1 16 KB 4-way, D1 64 KB 4-way, L2 128 KB 8-way, 64 B lines) of one warm
# compile per app, arm and strip mode: lazy (the core, plus the inline group for balanced) against all (every group
# evaluated before the compile). The compile's work is identical; only the realm it runs in differs.
#   12-cachesim.sh QJS_COMPILE OUT        QJS_COMPILE: 11-qjs-compile.c built; OUT: a new directory
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../../.." && pwd)
tool=$1 out=$2
mkdir -p "$out"
cd "$repo/compiler/typed"
for app in agenda chess; do
    python3 -c "import json,sys; a=json.load(open('$repo/apps/typed/$app/app.json')); sys.stdout.write(''.join(open('$repo/apps/typed/$app/'+s).read()+'\n' for s in a['sources']))" > "$out/$app.typed"
done
run() {  # app policy arm strip files...
    local app=$1 policy=$2 arm=$3 strip=$4; shift 4
    valgrind --tool=callgrind --cache-sim=yes --toggle-collect=measured_compile --I1=16384,4,64 --D1=65536,4,64 \
        --LL=131072,8,64 --callgrind-out-file="$out/$app-$arm-$strip.cg" "$tool" "$strip" "$out/$app.typed" "$policy" world \
        "$here/11-compile-driver.js" "$@" > "$out/$app-$arm-$strip.json" 2> "$out/$app-$arm-$strip.log"
    echo "$app $arm strip=$strip $(cat "$out/$app-$arm-$strip.json") $(grep -o 'Collected : .*' "$out/$app-$arm-$strip.log")"
}
groups="typed-rv32-inline.js typed-rv32-loops.js typed-rv32-kernel.js"
for strip in 0 2; do
    run agenda interactive lazy $strip tape.js typed-wasm.js typed-rv32.js typed-world.js
    run agenda interactive all $strip tape.js typed-wasm.js typed-rv32.js $groups typed-world.js
    run chess balanced lazy $strip tape.js typed-wasm.js typed-async.js typed-rv32.js typed-rv32-inline.js typed-world.js
    run chess balanced all $strip tape.js typed-wasm.js typed-async.js typed-rv32.js $groups typed-world.js
done
echo "events: Ir Dr Dw I1mr D1mr D1mw ILmr DLmr DLmw"
