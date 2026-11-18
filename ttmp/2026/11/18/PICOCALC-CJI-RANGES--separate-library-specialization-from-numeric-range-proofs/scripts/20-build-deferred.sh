#!/usr/bin/env bash
# Build the experimental compiler using the unmodified stage-0 translator.
set -euo pipefail
out=$(realpath -m "${1:?output directory}")
scripts=$(realpath "$(dirname "$0")")
sources=(ttmp/2026/11/17/*--cji-workspace*/sources/cji)
cji=$(realpath "${sources[0]}")
mkdir -p "$out"
work=$(mktemp -d "$out/source-XXXXXX")
cp -r "$cji/src" "$cji/package.json" "$cji/cji.js" "$work/"
patch -d "$work" -p1 < "$scripts/19-defer-range-proof.patch"
(cd "$work" && node "$cji/tools/bundle.mjs" --target cji -o "$out/bundle.js")
node --max-old-space-size=6000 --stack-size=4000 "$cji/cji.js" "$out/bundle.js" --emit > "$out/stage1.slir"
"$cji/slas" -S -c "$out/stage1.o" "$out/stage1.slir"
cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie -DCJI_PROFILE_GC -I"$cji/runtime" \
   "$cji/runtime/aot_main.c" "$cji/runtime/runtime.c" "$out/stage1.o" -lm -o "$out/stage1"
sha256sum "$out"/{bundle.js,stage1.slir,stage1}
