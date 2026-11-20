#!/usr/bin/env bash
# HISTORICAL_TREE comes from the lexical index ticket's 09 runner.
set -euo pipefail
if [[ $# -ne 5 ]]; then
  echo "usage: $0 WORK HISTORICAL_TREE QJS_INDEX CROSS_GCC CJI_RV32EMU" >&2
  exit 2
fi
work=$(realpath -- "$1")
history=$(realpath -- "$2")
native=$(realpath -- "$3")
gcc=$(realpath -- "$4")
emulator=$(realpath -- "$5")
here=$(cd -- "$(dirname -- "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
lexical=$(find "$root/ttmp/2026/11/20" -maxdepth 1 -name 'PICOCALC-LEXICAL-INDEX--*')
mkdir -- "$work/portable-history"
for mode in reference native; do
  stage="$work/portable-history/$mode"
  mkdir -- "$stage"
  cp -a "$history/picocalc-os" "$history/ttmp" "$stage/"
  cp "$work/composed-portable/"*.js "$stage/picocalc-os/compiler/"
  (
    cd "$stage"
    if [[ $mode == native ]]; then
      export NODE_OPTIONS="--import=$lexical/scripts/08-native-index-preload.mjs"
      export PICOCALC_LEX_INDEX_QJS="$native"
    else
      unset NODE_OPTIONS PICOCALC_LEX_INDEX_QJS
    fi
    node ttmp/2026/11/19/PICOCALC-LANGUAGE-E--*/scripts/01-check-functions-differential.mjs "$gcc" "$emulator" > language-e.json
    node ttmp/2026/11/19/PICOCALC-CONTINUATION-G--*/scripts/14-check-async-layout.mjs > continuation-g.txt
    node ttmp/2026/11/19/PICOCALC-EDITOR-ASYNC--*/scripts/03-check-editor-event-interleaving.mjs "$gcc" "$emulator" > editor-g.jsonl
    for file in language-e.json continuation-g.txt editor-g.jsonl; do cmp "$history/$file" "$file"; done
    printf '{"provider":"%s","e":"identical","g":"identical","editor":"identical"}\n' "$mode"
  )
done | tee "$work/portable-history.jsonl"
