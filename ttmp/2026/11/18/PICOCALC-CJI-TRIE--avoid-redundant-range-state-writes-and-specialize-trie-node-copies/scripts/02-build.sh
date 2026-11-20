#!/usr/bin/env bash
set -euo pipefail
out=$(realpath -m "${1:?destination}")
variant=${2:?reuse, typed or both}
scripts=$(realpath "$(dirname "$0")")
cji=$(realpath cji)
ranges=(ttmp/2026/11/18/*CJI-RANGES*/scripts)
mkdir -p "$out/source"
cp -r "$cji/src" "$cji/package.json" "$cji/cji.js" "$out/source"
patch -d "$out/source" -p1 < "$ranges/19-defer-range-proof.patch"
patch -d "$out/source" -p1 < "$ranges/26-prove-numeric-keys.patch"
python3 "$scripts/01-variant.py" "$out/source/src/ranges.js" "$variant"
(cd "$out/source" && node "$cji/tools/bundle.mjs" --target cji -o "$out/bundle.js")
node --max-old-space-size=6000 --stack-size=4000 "$cji/cji.js" "$out/bundle.js" --emit > "$out/stage1.slir"
"$cji/slas" -S -c "$out/stage1.o" "$out/stage1.slir"
cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie -DCJI_PROFILE_GC -I"$cji/runtime" \
  "$cji/runtime/aot_main.c" "$cji/runtime/runtime.c" "$out/stage1.o" -lm -o "$out/stage1"
sha256sum "$out"/{bundle.js,stage1.slir,stage1}
