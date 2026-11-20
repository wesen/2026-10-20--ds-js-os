#!/usr/bin/env bash
set -euo pipefail
compiler=$(realpath "${1:?stage1 executable or source cji.js}")
out=$(realpath -m "${2:?scratch directory}")
cji=$(realpath cji)
fixtures=$(realpath "$(dirname "$0")/fixtures/world")
mkdir -p "$out"
if [[ $compiler == *.js ]]; then
  command=(node --stack-size=4000 "$compiler")
  flags=(--emit)
else
  command=("$compiler" -g -C -h 16777216 -H 16777216 --)
  flags=()
fi
for world in agenda files; do
  "${command[@]}" "picocalc-os/js/apps/$world.js" --driver "$fixtures/$world.js" "${flags[@]}" \
    > "$out/$world.slir" 2> "$out/$world.compile.log"
  "$cji/slas" -h 8388608 "$out/$world.slir" > "$out/$world.out" 2> "$out/$world.run.log"
  cat "$out/$world.out"
done
