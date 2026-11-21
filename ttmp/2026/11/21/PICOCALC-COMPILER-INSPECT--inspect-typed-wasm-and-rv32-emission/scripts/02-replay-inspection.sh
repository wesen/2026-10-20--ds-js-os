#!/usr/bin/env bash
# Run from the repository root. Large, regenerable listings stay in OUTPUT.
set -euo pipefail
out=${1:?usage: bash 02-replay-inspection.sh OUTPUT}
mkdir -p "$out"
here=$(dirname "$0")
previous=("$here"/../../../20/PICOCALC-TYPED-RAY--*)
cli=picocalc-os/tools/typed-inspect.mjs
src=picocalc-os/worlds/raytrace/raytrace.typed
backend=picocalc-os/compiler/typed-rv32.js
node "$previous/scripts/compiler/positive-divisors.mjs" "$backend" "$out/div.js"
node "$here/01-capture-frame.mjs" "$out/ordinary.json" "$backend" "$src"
node "$here/01-capture-frame.mjs" "$out/div-pc.json" "$out/div.js" "$src"
node "$cli" "$src" --function typedRayPack --jsonl --profile "$out/ordinary.json" > "$out/ordinary.jsonl"
node "$cli" "$src" --function typedRayPack --jsonl --profile "$out/div-pc.json" --backend "$out/div.js" > "$out/div.jsonl"
node "$cli" diff "$out/ordinary.jsonl" "$out/div.jsonl" > "$out/pack.diff.txt"
node "$cli" "$src" --target rv32 --function typedRayInShadow --profile "$out/ordinary.json" --hot 8 > "$out/shadow-hot.txt"
