#!/usr/bin/env bash
# Build the experimental compiler using the unmodified stage-0 translator.
set -euo pipefail
out=$(realpath -m "${1:?output directory}")
scripts=$(realpath "$(dirname "$0")")
cji=$(realpath cji)
mkdir -p "$out"
work=$(mktemp -d "$out/source-XXXXXX")
cp -r "$cji/src" "$cji/package.json" "$cji/cji.js" "$work/"
patch -d "$work" -p1 < "$scripts/19-defer-range-proof.patch"
case "${2:-defer}" in
    defer) ;;
    guard|guard-join)
        patch -d "$work" -p1 < "$scripts/26-prove-numeric-keys.patch"
        if [[ $2 == guard-join ]]; then patch -d "$work" -p1 < "$scripts/40-identical-interval.patch"; fi
        ;;
    *) echo "Expected defer, guard or guard-join" >&2; exit 2 ;;
esac
(cd "$work" && node "$cji/tools/bundle.mjs" --target cji -o "$out/bundle.js")
node --max-old-space-size=6000 --stack-size=4000 "$cji/cji.js" "$out/bundle.js" --emit > "$out/stage1.slir"
"$cji/slas" -S -c "$out/stage1.o" "$out/stage1.slir"
cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie -DCJI_PROFILE_GC -I"$cji/runtime" \
   "$cji/runtime/aot_main.c" "$cji/runtime/runtime.c" "$out/stage1.o" -lm -o "$out/stage1"
sha256sum "$out"/{bundle.js,stage1.slir,stage1}
