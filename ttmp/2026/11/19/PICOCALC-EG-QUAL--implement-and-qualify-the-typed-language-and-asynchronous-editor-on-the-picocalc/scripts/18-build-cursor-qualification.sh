#!/usr/bin/env bash
# Re-test a previously studied scanner on the actual final G4 compiler without changing product source.
set -euo pipefail
work=$1
idf=$2
root=$(git rev-parse --show-toplevel)
scripts=$(cd "$(dirname "$0")" && pwd)
wave=("$root"/ttmp/2026/11/19/PICOCALC-LANGUAGE-E--*/scripts/10-stage-eager-cursor.py)
mkdir -p "$work/candidate-cursor"
git clone --quiet --local --no-checkout "$root" "$work/candidate-cursor/checkout"
git -C "$work/candidate-cursor/checkout" checkout --quiet --detach 2e4fee1
python3 -B "${wave[0]}" "$work/cursor-files" >"$work/candidate-cursor/staged.json"
for source in typed-wasm.js typed-async.js; do
    cp "$work/cursor-files/g4-cursor/$source" "$work/candidate-cursor/checkout/picocalc-os/compiler/$source"
done
bash "$scripts/02-prepare-images.sh" "$work" 2e4fee1 "$idf" candidate-cursor
python3 -B "$scripts/09-fixed-wall-images.py" "$work/candidate-cursor" "$idf"
