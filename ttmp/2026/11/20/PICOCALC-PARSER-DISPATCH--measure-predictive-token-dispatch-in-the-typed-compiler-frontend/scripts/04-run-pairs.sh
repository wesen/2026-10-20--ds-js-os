#!/usr/bin/env bash
set -euo pipefail
wave=$1
oracle=$2
cpu=$3
out=$4
src=$(cd "$(dirname "$0")" && pwd)
root=$(git rev-parse --show-toplevel)
index_scripts=("$root"/ttmp/2026/11/20/PICOCALC-LEXICAL-INDEX--*/scripts)
mkdir -p "$out"
control="$wave/native-index-reuse/checkout/picocalc-os/compiler"
candidate="$out/dispatch"
mkdir "$candidate"
cp "$control/"*.js "$candidate"
python3 -B "$src/02-stage-prefix.py" "$candidate/typed-wasm.js"
run() {
    local d=$1
    shift
    taskset -c "$cpu" "$wave/index/qjs-index" INDEX "$d/typed-wasm.js" "$d/typed-async.js" \
        "$d/typed-rv32.js" "$d/typed-world.js" "$@"
}
for app in editor files agenda; do
    extra=()
    if [[ $app != editor ]]; then extra=("$root/picocalc-os/worlds/$app/compile.js"); fi
    for target in wasm rv32 rv32-buffered; do
        ext=elf
        if [[ $target == wasm ]]; then ext=wasm; fi
        run "$candidate" "${extra[@]}" "${index_scripts[0]}/06-measure-index.js" -- \
            "$app" "$target" "$oracle/$app.typed" "$oracle/$app.$ext.b64" hex |
            tail -n +2 | xxd -r -p > "$out/$app.$target.bin"
        cmp "$out/$app.$target.bin" "$oracle/$app.$target.reference.bin"
    done
done
run "$candidate" "${index_scripts[0]}/05-check-index.js" > "$out/oracle.json"
for trial in {1..7}; do
    order=(control dispatch)
    if ((trial%2==0)); then order=(dispatch control); fi
    for lane in "${order[@]}"; do
        dir=$control
        if [[ $lane == dispatch ]]; then dir=$candidate; fi
        run "$dir" "$src/03-time-parser.js" -- "$wave/index-professor/editor.typed" |
            jq -c --arg lane "$lane" --argjson trial "$trial" '.+{lane:$lane,trial:$trial}' >> "$out/timings.jsonl"
    done
done
