#!/usr/bin/env bash
# Count every executed x86 instruction for the exact four profile binaries.
set -euo pipefail
build=$(realpath "${1:?build directory}")
guard=$(realpath "${2:?guarded stage 1}")
reference=$(realpath "${3:?reference directory}")
out="$build/instructions"
mkdir -p "$out"
for world in agenda files; do
  for variant in guard both reuse typed; do
    exe="$build/$variant/stage1"
    if [[ $variant == guard ]]; then exe="$guard"; fi
    stem="$out/$world-$variant"
    valgrind --tool=callgrind --callgrind-out-file="$stem.cg" "$exe" -g -C -h 8388608 -H 8388608 -- \
      "picocalc-os/js/apps/$world.js" --world-unit > "$stem.ir" 2> "$stem.log"
    cmp "$reference/$world.ref" "$stem.ir"
    rg '^totals: ' "$stem.cg" | sed "s/^totals: /$world $variant /" | tee -a "$out/completed.txt"
  done
done
