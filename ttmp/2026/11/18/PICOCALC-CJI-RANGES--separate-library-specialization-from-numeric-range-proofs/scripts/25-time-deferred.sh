#!/usr/bin/env bash
set -euo pipefail
base=$(realpath "${1:?baseline experiment directory}")
out=$(realpath "${2:?candidate directory}")
for round in 0 1 2 3; do
    order=(baseline candidate)
    if (( round % 2 )); then order=(candidate baseline); fi
    for variant in "${order[@]}"; do
        exe="$out/stage1"
        if [[ $variant == baseline ]]; then exe="$base/stage1-measured"; fi
        "$exe" -g -C -h 8388608 -H 8388608 -- picocalc-os/js/apps/agenda.js --world-unit \
            > "$out/$variant.ir" 2> "$out/$variant-$round.stats"
        cmp "$base/agenda.ref" "$out/$variant.ir"
    done
done
