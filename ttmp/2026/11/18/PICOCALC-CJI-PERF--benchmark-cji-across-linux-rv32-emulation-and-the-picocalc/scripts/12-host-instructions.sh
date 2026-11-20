#!/usr/bin/env bash
# Rebuild the exact native code with local CJI function symbols. Verify .text equality before profiling.
set -euo pipefail
out=$(realpath "$1")
cji=$(realpath cji)
SLAS_SYMBOLS=1 "$cji/slas" -S -c "$out/stage1-named.o" "$cji/build/rv32/stage1/stage1.slir"
cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie -I"$cji/runtime" \
    "$cji/runtime/aot_main.c" "$cji/runtime/runtime.c" "$out/stage1-named.o" -lm -o "$out/stage1-named"
for variant in plain named; do
    objcopy -O binary --only-section=.text "$out/stage1-$variant" "$out/$variant.text"
done
cmp "$out/plain.text" "$out/named.text"
for world in "${@:2}"; do
    stem="$out/$world.instructions"
    valgrind --tool=callgrind --dump-instr=yes --collect-jumps=yes --callgrind-out-file="$stem.cg" \
        "$out/stage1-named" -C -g -h 8388608 -H 8388608 -- "picocalc-os/js/apps/$world.js" --world-unit \
        > "$stem.ir" 2> "$stem.log"
    cmp "$out/$world.ref" "$stem.ir"
    rg '^(positions|events|totals):' "$stem.cg"
done
