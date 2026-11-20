#!/usr/bin/env bash
# HISTORICAL_TREE is the fixture tree made by the lexical index ticket's 09 runner.
set -euo pipefail
if [[ $# -ne 5 ]]; then
  echo "usage: $0 SPAN_WORK HISTORICAL_TREE QJS_INDEX CROSS_GCC CJI_RV32EMU" >&2
  exit 2
fi
work=$(realpath -- "$1")
historical=$(realpath -- "$2")
export PICOCALC_LEX_INDEX_QJS
PICOCALC_LEX_INDEX_QJS=$(realpath -- "$3")
gcc=$(realpath -- "$4")
emulator=$(realpath -- "$5")
here=$(cd -- "$(dirname -- "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
lexical=$(find "$root/ttmp/2026/11/20" -maxdepth 1 -name 'PICOCALC-LEXICAL-INDEX--*')
export NODE_OPTIONS="--import=$lexical/scripts/08-native-index-preload.mjs"
mkdir -- "$work/history"
for lane in spans indexed-prepass composed; do
  stage="$work/history/$lane"
  mkdir -- "$stage"
  cp -a "$historical/picocalc-os" "$historical/ttmp" "$stage/"
  cp "$work/$lane/"*.js "$stage/picocalc-os/compiler/"
  (
    cd "$stage"
    node ttmp/2026/11/19/PICOCALC-LANGUAGE-E--*/scripts/01-check-functions-differential.mjs "$gcc" "$emulator" > language-e.json
    node ttmp/2026/11/19/PICOCALC-CONTINUATION-G--*/scripts/14-check-async-layout.mjs > continuation-g.txt
    node ttmp/2026/11/19/PICOCALC-EDITOR-ASYNC--*/scripts/03-check-editor-event-interleaving.mjs "$gcc" "$emulator" > editor-g.jsonl
    for file in language-e.json continuation-g.txt editor-g.jsonl; do
      cmp "$historical/$file" "$file"
    done
    printf '{"lane":"%s","e":"identical","g":"identical","editor":"identical"}\n' "$lane"
  )
done | tee "$work/historical-parity.jsonl"
