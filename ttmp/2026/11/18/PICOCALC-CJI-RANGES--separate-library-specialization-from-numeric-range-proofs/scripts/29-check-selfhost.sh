#!/usr/bin/env bash
# Test the compiler itself as input without replacing the generated bootstrap.
set -euo pipefail
candidate=$(realpath "${1:?guarded stage-0 source directory}")
out=$(realpath -m "${2:?output directory}")
cji=$(realpath cji)
unit="$cji/build/rv32/stage1"
mkdir -p "$out"
node --stack-size=4000 --max-old-space-size=6000 "$candidate/cji.js" "$unit/bundle-cji.js" --emit > "$out/selfhost.ir"
sha256sum "$unit/stage1.slir" "$out/selfhost.ir"
cmp "$unit/stage1.slir" "$out/selfhost.ir"
