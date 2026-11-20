#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 || $# -gt 5 || (${5:-reuse} != reuse) ]]; then
  echo "usage: $0 FRESH_WORK_DIR QJS_INDEX CROSS_GCC CJI_RV32EMU [reuse]" >&2
  exit 2
fi
work=$1
qjs=$(realpath -- "$2")
gcc=$(realpath -- "$3")
emulator=$(realpath -- "$4")
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
repo=$(git -C "$script_dir" rev-parse --show-toplevel)
mkdir -p -- "$work"
work=$(cd -- "$work" && pwd)
"$script_dir/01-stage-index.sh" "$work" >/dev/null
if [[ ${5:-} == reuse ]]; then
  node "$script_dir/10-reuse-token-overlay.mjs" "$work/picocalc-os/compiler"
fi

cd "$repo"
fixtures=(
  ttmp/2026/11/19/PICOCALC-LANGUAGE-E--*/scripts/01-check-functions-differential.mjs
  ttmp/2026/11/19/PICOCALC-CONTINUATION-G--*/scripts/14-check-async-layout.mjs
  ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--*/scripts/lowering/rv32.mjs
  ttmp/2026/11/19/PICOCALC-EDITOR-ASYNC--*/scripts/0[23]-*
)
git archive 2e4fee1 picocalc-os/worlds "${fixtures[@]}" | tar -x -C "$work"
for dir in build sdk third_party; do
  ln -s "$repo/picocalc-os/$dir" "$work/picocalc-os/$dir"
done
cd "$work"
# Inherit the provider in the E fixture's own Wasm worker and keep test
# execution on the historical scripts and their original input sources.
export PICOCALC_LEX_INDEX_QJS="$qjs"
export NODE_OPTIONS="--import=$script_dir/08-native-index-preload.mjs"
node ttmp/2026/11/19/PICOCALC-LANGUAGE-E--*/scripts/01-check-functions-differential.mjs "$gcc" "$emulator" |
  tee language-e.json
node ttmp/2026/11/19/PICOCALC-CONTINUATION-G--*/scripts/14-check-async-layout.mjs |
  tee continuation-g.txt
node ttmp/2026/11/19/PICOCALC-EDITOR-ASYNC--*/scripts/03-check-editor-event-interleaving.mjs "$gcc" "$emulator" |
  tee editor-g.jsonl
