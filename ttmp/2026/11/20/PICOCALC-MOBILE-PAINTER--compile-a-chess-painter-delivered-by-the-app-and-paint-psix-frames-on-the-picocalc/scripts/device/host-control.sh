#!/usr/bin/env bash
# Run the release's original Chess renderer and layout with a virtual clock.
set -euo pipefail
out=$(realpath -m "$1")
repo=$(git rev-parse --show-toplevel)
base=8715aaf60eef2ef34f2b351e03d83fd69bec1e48
recipe=$(git -C "$repo" ls-files 'ttmp/2026/11/20/PICOCALC-TYPED-CHESS--*/scripts/05-prepare-chess.mjs')
mkdir -p "$out/tree" "$out/run"
git -C "$repo" archive "$base" picocalc-os "$recipe" | tar -xf - -C "$out/tree"
cd "$out/tree"
make -C picocalc-os -j4 "WASM_TC=$repo/picocalc-os/build/wasm-toolchain" build/picocalc-host typed-world-reactor
node "$recipe" wasm "$out/game" picocalc-os/build/typed-world-reactor.wasm > "$out/module.json"
cat > "$out/keys.txt" <<'KEYS'
wait 350
key h
wait 600
capture e2.png
key up
wait 600
capture e3.png
key right
wait 600
capture f3.png
KEYS
picocalc-os/build/picocalc-host -j "$out/game/js" -o "$out/run" -u "$out/uart.log" "$out/keys.txt"
