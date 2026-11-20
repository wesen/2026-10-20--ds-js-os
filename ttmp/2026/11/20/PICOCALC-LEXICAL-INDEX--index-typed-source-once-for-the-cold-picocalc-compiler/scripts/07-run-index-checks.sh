#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 || $# -gt 5 ]]; then
  echo "usage: $0 FRESH_WORK_DIR QJS_INDEX WASM_REACTOR_DIR ELF_REACTOR_DIR [CPU]" >&2
  exit 2
fi
work=$1
qjs=$2
wasm=$3
elf=$4
cpu=${5:-}
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
repo=$(git -C "$script_dir" rev-parse --show-toplevel)
mkdir -p -- "$work"
work=$(cd -- "$work" && pwd)
"$script_dir/01-stage-index.sh" "$work/index" >/dev/null
mkdir -- "$work/reference"
git -C "$repo" archive 2e4fee1 picocalc-os/compiler picocalc-os/worlds | tar -x -C "$work/reference"
worlds="$work/reference/picocalc-os/worlds"

while IFS= read -r part; do
  cat "$worlds/editor/$part"
  printf '\n'
done < "$worlds/editor/source.list" > "$work/editor.typed"
cat "$worlds/files/files.typed" > "$work/files.typed"
{
  cat "$worlds/agenda/reminder.typed"
  printf '\n'
  cat "$worlds/agenda/entry.typed"
} > "$work/agenda.typed"

run() {
  if [[ -n $cpu ]]; then
    taskset -c "$cpu" "$@"
  else
    "$@"
  fi
}

index="$work/index/picocalc-os/compiler"
run "$qjs" INDEX "$index/typed-wasm.js" "$index/typed-async.js" "$index/typed-rv32.js" "$index/typed-world.js" \
  "$script_dir/05-check-index.js" | tee "$work/oracle.json"

app_run() {
  local lane=$1 app=$2 engine=$3 reactor=$4 output=$5
  local mode=REFERENCE
  if [[ $lane == index ]]; then mode=INDEX; fi
  local compiler="$work/$lane/picocalc-os/compiler"
  local extra=()
  if [[ $app != editor ]]; then extra=("$worlds/$app/compile.js"); fi
  run "$qjs" "$mode" "$compiler/typed-wasm.js" "$compiler/typed-async.js" "$compiler/typed-rv32.js" \
    "$compiler/typed-world.js" "${extra[@]}" "$script_dir/06-measure-index.js" -- \
    "$app" "$engine" "$work/$app.typed" "$reactor" "$output"
}

for app in files agenda editor; do
  runtime="$app-reactor"
  if [[ $app == editor ]]; then runtime=typed-world-reactor; fi
  base64 -w0 "$wasm/$runtime.wasm" > "$work/$app.wasm.b64"
  base64 -w0 "$elf/$runtime.elf" > "$work/$app.elf.b64"
  for engine in wasm rv32 rv32-buffered; do
    reactor="$work/$app.elf.b64"
    if [[ $engine == wasm ]]; then reactor="$work/$app.wasm.b64"; fi
    for lane in reference index; do
      receipt="$work/$app.$engine.$lane"
      app_run "$lane" "$app" "$engine" "$reactor" hex > "$receipt.out"
      tail -n +2 "$receipt.out" | xxd -r -p > "$receipt.bin"
      head -n1 "$receipt.out" | jq -S 'del(.ms)' > "$receipt.json"
    done
    cmp "$work/$app.$engine.reference.bin" "$work/$app.$engine.index.bin"
    cmp "$work/$app.$engine.reference.json" "$work/$app.$engine.index.json"
    sha256sum "$work/$app.$engine.index.bin"
  done
  cmp "$work/$app.rv32.index.bin" "$work/$app.rv32-buffered.index.bin"
done | tee "$work/artifacts.sha256"

node --input-type=module - "$work" <<'NODE'
import {readFileSync} from "node:fs";
for (const app of ["files", "agenda", "editor"]) {
  if (!WebAssembly.validate(readFileSync(process.argv[2] + "/" + app + ".wasm.index.bin")))
    throw new Error("invalid linked Wasm for " + app);
}
NODE

for trial in 1 2 3 4 5 6 7; do
  for lane in reference index; do
    app_run "$lane" editor rv32 "$work/editor.elf.b64" summary |
      jq -c --arg lane "$lane" --argjson trial "$trial" '. + {lane:$lane,trial:$trial}'
  done
done | tee "$work/g4-linked-timing.jsonl"
