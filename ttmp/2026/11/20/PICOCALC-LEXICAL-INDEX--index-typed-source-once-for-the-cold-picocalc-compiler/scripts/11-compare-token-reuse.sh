#!/usr/bin/env bash
# Compare the optional borrowed-current-token arm to a completed default run.
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 CHECK_WORK_DIR QJS_INDEX [CPU]" >&2
  exit 2
fi
work=$1
qjs=$2
cpu=${3:-}
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
default="$work/index/picocalc-os/compiler"
worlds="$work/reference/picocalc-os/worlds"
reuse="$work/reuse"
mkdir -- "$reuse"
cp -a "$default/." "$reuse/"
node "$script_dir/10-reuse-token-overlay.mjs" "$reuse"

run() {
  if [[ -n $cpu ]]; then taskset -c "$cpu" "$@"
  else "$@"; fi
}

run "$qjs" INDEX "$reuse/typed-wasm.js" "$reuse/typed-async.js" "$reuse/typed-rv32.js" "$reuse/typed-world.js" \
  "$script_dir/05-check-index.js" > "$work/reuse.oracle.json"
cmp "$work/oracle.json" "$work/reuse.oracle.json"

app_run() {
  local compiler=$1 app=$2 engine=$3 reactor=$4 output=$5
  local extra=()
  if [[ $app != editor ]]; then extra=("$worlds/$app/compile.js"); fi
  run "$qjs" INDEX "$compiler/typed-wasm.js" "$compiler/typed-async.js" "$compiler/typed-rv32.js" \
    "$compiler/typed-world.js" "${extra[@]}" "$script_dir/06-measure-index.js" -- \
    "$app" "$engine" "$work/$app.typed" "$reactor" "$output"
}

for app in files agenda editor; do
  for engine in wasm rv32 rv32-buffered; do
    reactor="$work/$app.elf.b64"
    if [[ $engine == wasm ]]; then reactor="$work/$app.wasm.b64"; fi
    receipt="$work/$app.$engine.reuse"
    app_run "$reuse" "$app" "$engine" "$reactor" hex > "$receipt.out"
    tail -n +2 "$receipt.out" | xxd -r -p > "$receipt.bin"
    head -n1 "$receipt.out" | jq -S 'del(.ms)' > "$receipt.json"
    cmp "$work/$app.$engine.index.bin" "$receipt.bin"
    cmp "$work/$app.$engine.index.json" "$receipt.json"
    sha256sum "$receipt.bin"
  done
done | tee "$work/reuse.artifacts.sha256"

for trial in 1 2 3 4 5 6 7 8 9 10 11; do
  order=(default reuse)
  if (( trial % 2 == 0 )); then order=(reuse default); fi
  for lane in "${order[@]}"; do
    compiler=$default
    if [[ $lane == reuse ]]; then compiler=$reuse; fi
    app_run "$compiler" editor rv32 "$work/editor.elf.b64" summary |
      jq -c --arg lane "$lane" --argjson trial "$trial" 'del(.layout) + {lane:$lane,trial:$trial}'
  done
done | tee "$work/reuse.g4-linked-timing.jsonl"
