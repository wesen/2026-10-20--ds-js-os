#!/usr/bin/env bash
# Generate independent output identities for the board's frontend validation.
set -euo pipefail
compiler=$(realpath "${1:?stage1 executable or source cji.js}")
out=$(realpath -m "${2:?scratch output directory}")
shift 2
cji=$(realpath ttmp/2026/11/17/*--cji-workspace*/sources/cji)
link=$(realpath picocalc-os/port/esp32p4/build-elf/cji)
mkdir -p "$out"
if [[ $compiler == *.js ]]; then
  command=(node --stack-size=4000 "$compiler")
  flags=(--emit)
else
  command=("$compiler" -g -C -h 8388608 -H 8388608 --)
  flags=()
fi
for world in "$@"; do
  source=$(python3 -c 'import json,sys; print("picocalc-os/js/" + next(w["file"] for w in json.load(open("picocalc-os/js/system.json"))["worlds"] if w["name"] == sys.argv[1]))' "$world")
  "${command[@]}" "$source" --world-unit "${flags[@]}" > "$out/$world.slir" 2> "$out/$world.compile.log"
  node "$cji/tools/link-units.mjs" "$link/prelude.slir" "$out/$world.slir" > "$out/$world.linked.slir"
  "$link/slas-rv32" -c "$out/$world.elf" --module --extern "$link/unit.list" "$out/$world.linked.slir" > "$out/$world.link.log" 2>&1
  stat -c '%n %s bytes' "$out/$world.elf"
  sha256sum "$source" "$out/$world.slir" "$out/$world.elf"
done
