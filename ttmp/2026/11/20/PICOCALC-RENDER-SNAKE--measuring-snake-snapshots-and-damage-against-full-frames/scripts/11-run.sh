#!/usr/bin/env bash
# Run from the repository root. Writable output may be outside the checkout.
set -euo pipefail
d=$(dirname "$0")
out=${1:?expected output directory}
mkdir -p "$out"
node "$d/07-measure.mjs" "$out" --timings
shared=(ttmp/2026/11/20/PICOCALC-RENDER-LAB--*/scripts/04-screen-oracle.mjs)
for arm in control aa semantic; do
  node "${shared[0]}" "$out/$arm.ndjson" "$out/$arm-pixels" --skip-frame 5
done
node "$d/08-damage-input.mjs" "$out"
cc -O2 -I picocalc-os/nucleus -ffunction-sections -fdata-sections "$d/09-damage.c" picocalc-os/nucleus/gfx.c picocalc-os/nucleus/util.c -Wl,--gc-sections -o "$out/damage"
for trial in {0..11}; do
  "$out/damage" "$out/damage-input.txt" "$out/control-pixels" 5 "$trial" > "$out/damage-$trial.csv"
done
for scenario in '2 0' '12 0' '14 0' '-1 0 35 10' '-1 0 0 75'; do
  read -ra args <<< "$scenario"
  "$out/damage" "$out/damage-input.txt" "$out/control-pixels" "${args[@]}" > "$out/scenario-${scenario// /_}.csv"
done
python3 "$d/12-summarize.py" "$out"
