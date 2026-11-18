#!/usr/bin/env bash
set -euo pipefail
out=$(realpath -m "${1:?scratch directory}")
policy=${2:?local or proof-off}
scripts=$(realpath "$(dirname "$0")")
cji=$(realpath ttmp/2026/11/17/*--cji-workspace*/sources/cji)
ranges=(ttmp/2026/11/18/*CJI-RANGES*/scripts)
trie=(ttmp/2026/11/18/*CJI-TRIE*/scripts)
test ! -e "$out/source"
mkdir -p "$out/source"
cp -r "$cji/src" "$cji/package.json" "$cji/cji.js" "$out/source"
patch -d "$out/source" -p1 < "$ranges/19-defer-range-proof.patch"
patch -d "$out/source" -p1 < "$ranges/26-prove-numeric-keys.patch"
python3 "$trie/01-variant.py" "$out/source/src/ranges.js" both
if [[ $policy == local ]]; then
  cp "$scripts/local-numbers.js" "$out/source/src/"
fi
python3 "$scripts/configure.py" "$out/source" "$policy"
(cd "$out/source" && node "$cji/tools/bundle.mjs" --target cji -o "$out/bundle.js")
node --max-old-space-size=6000 --stack-size=4000 "$cji/cji.js" "$out/bundle.js" --emit > "$out/stage1.progress"
mv "$out/stage1.progress" "$out/stage1.slir"
"$cji/slas" -S -c "$out/stage1.o" "$out/stage1.slir"
cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie -DCJI_PROFILE_GC -I"$cji/runtime" \
  "$cji/runtime/aot_main.c" "$cji/runtime/runtime.c" "$out/stage1.o" -lm -o "$out/stage1"
sha256sum "$out"/{bundle.js,stage1.slir,stage1}
