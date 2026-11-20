#!/usr/bin/env bash
set -euo pipefail
# Compiler and timing stages only. Run 15-check-span-reuse.mjs for the behavioral oracle.

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 FRESH_WORK_DIR REACTOR_ELF [CPU]" >&2
  exit 2
fi
work=$1
elf=$(realpath -- "$2")
cpu=${3:-}
here=$(cd -- "$(dirname -- "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
mkdir -p -- "$work"
work=$(cd -- "$work" && pwd)
cd "$repo"
lexical=$(find ttmp/2026/11/20 -maxdepth 1 -name 'PICOCALC-LEXICAL-INDEX--*')
continuation=$(find ttmp/2026/11/19 -maxdepth 1 -name 'PICOCALC-CONTINUATION-G--*')
python3 "$here/13-stage-span-reuse.py" "$work"
mkdir -- "$work/pre-g"
for file in typed-wasm typed-world typed-rv32; do
  git show "1357545:picocalc-os/compiler/$file.js" > "$work/pre-g/$file.js"
done
while IFS= read -r file; do
  git show "1357545:picocalc-os/worlds/editor/$file"
  printf '\n'
done < <(git show 1357545:picocalc-os/worlds/editor/source.list) > "$work/pre-g/editor.typed"

mkdir -- "$work/indexed"
cp "$work/stock/"*.js "$work/indexed/"
node "$lexical/scripts/02-index-overlay.mjs" "$work/indexed/typed-wasm.js"
node "$lexical/scripts/10-reuse-token-overlay.mjs" "$work/indexed"
for lane in indexed-prepass indexed-spans composed; do cp -a "$work/indexed" "$work/$lane"; done
for lane in indexed-spans composed; do python3 "$here/13-stage-span-reuse.py" "$work/$lane" --apply-existing; done
for lane in indexed-prepass composed; do node "$here/14-indexed-prepass-overlay.mjs" "$work/$lane"; done

python3 "$here/17-stage-span-timing.py" "$work" "$lexical" "$continuation/scripts/15-benchmark-quickjs.c"
cc -O2 -I picocalc-os/third_party/quickjs -I "$lexical/scripts" "$work/tracked-qjs.c" \
  "$lexical/scripts/01-typed-lex-index.c" picocalc-os/build/qjs/*.o -lm -lpthread -o "$work/qjs-spans"
base64 -w0 "$elf" > "$work/reactor.b64"

run() {
  if [[ -n $cpu ]]; then taskset -c "$cpu" "$@"; else "$@"; fi
}
measure() {
  local lane=$1 trial=$2 mode=REFERENCE input="$work/stock/editor.typed"
  local dir="$work/$lane"
  local async=()
  if [[ $lane == indexed* || $lane == composed* ]]; then mode=INDEX; fi
  if [[ $lane == pre-g ]]; then input="$dir/editor.typed"; else async=("$dir/typed-async.js"); fi
  run "$work/qjs-spans" "$mode" "$work/before-load.js" "$dir/typed-wasm.js" "${async[@]}" \
      "$dir/typed-rv32.js" "$dir/typed-world.js" "$work/timing.js" -- \
      editor rv32 "$input" "$work/reactor.b64" summary |
    jq -c --arg lane "$lane" --argjson trial "$trial" '. + {lane:$lane,trial:$trial}'
}
for trial in 1 2 3 4 5 6 7 8 9; do
  order=(pre-g stock headers spans indexed indexed-prepass indexed-spans composed)
  if (( trial % 2 == 0 )); then
    order=(composed indexed-spans indexed-prepass indexed spans headers stock pre-g)
  fi
  for lane in "${order[@]}"; do measure "$lane" "$trial"; done
done > "$work/linked-timing.jsonl"
for trial in 1 2 3 4 5; do
  order=(indexed-profile indexed-prepass-profile indexed-spans-profile composed-profile)
  if (( trial % 2 == 0 )); then order=(composed-profile indexed-spans-profile indexed-prepass-profile indexed-profile); fi
  for lane in "${order[@]}"; do measure "$lane" "$trial"; done
done > "$work/indexed-phases.jsonl"
sha256sum "$elf" "$work/stock/editor.typed" "$work/pre-g/editor.typed" "$work/qjs-spans"
