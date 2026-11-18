#!/usr/bin/env bash
# Isolate one source-level change. Bootstrapping and native assembly use the ordinary stage-0 tools.
set -euo pipefail
out=$(realpath "$1")
candidate=$2
scripts=$(realpath "$(dirname "$0")")
cji=$(realpath ttmp/2026/11/17/*--cji-workspace*/sources/cji)
target="$out/$candidate"
mkdir -p "$target"
node --max-old-space-size=6000 --stack-size=4000 "$scripts/14-build-candidate.mjs" "$cji" "$candidate" > "$target/stage1.slir"
"$cji/slas" -S -c "$target/stage1.o" "$target/stage1.slir"
cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie -DCJI_PROFILE_GC -I"$cji/runtime" \
    "$cji/runtime/aot_main.c" "$cji/runtime/runtime.c" "$target/stage1.o" -lm -o "$target/stage1"
for round in 0 1 2 3; do
    variants=(baseline candidate)
    if (( round % 2 )); then variants=(candidate baseline); fi
    for variant in "${variants[@]}"; do
        exe="$target/stage1"
        if [[ $variant == baseline ]]; then exe="$out/stage1-measured"; fi
        "$exe" -g -C -h 8388608 -H 8388608 -- picocalc-os/js/apps/agenda.js --world-unit \
            > "$target/$variant.ir" 2> "$target/$variant-$round.stats"
        cmp "$target/$variant.ir" "$out/agenda.ref"
    done
done
