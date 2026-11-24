#!/usr/bin/env bash
# The cache simulation of 12-cachesim.sh on PICOCALC-TYPED-PIPELINE's own pair: its control (e219349, one RV32
# bundle) and its candidate (211383b, a scope-hoisted core with lazily loaded pass groups), Agenda (interactive, then
# reminder.typed + entry.typed with no imports) and Chess (balanced, a world), unstripped as both were.
#   13-cachesim-pipeline.sh QJS_COMPILE OLD NEW OUT
# OLD and NEW: directories holding `git archive REV compiler/typed apps/typed/agenda apps/typed/chess`, extracted.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tool=$1 old=$2 new=$3 out=$4
mkdir -p "$out"
units() {  # dir
    python3 -c "import json,sys; d='$1/apps/typed/'; a=json.load(open(d+'agenda/app.json')); sys.stdout.write(''.join(open(d+'agenda/'+s).read()+'\n' for s in a['sources']))" > "$1/agenda.typed"
    python3 -c "import json,sys; d='$1/apps/typed/'; a=json.load(open(d+'chess/app.json')); sys.stdout.write(''.join(open(d+'chess/'+s).read()+'\n' for s in a['sources']))" > "$1/chess.typed"
}
run() {  # tag dir app policy world files...
    local tag=$1 dir=$2 app=$3 policy=$4 world=$5; shift 5
    (cd "$dir/compiler/typed" && valgrind --tool=callgrind --cache-sim=yes --toggle-collect=measured_compile \
        --I1=16384,4,64 --D1=65536,4,64 --LL=131072,8,64 --callgrind-out-file="$out/$tag-$app.cg" "$tool" 0 \
        "$dir/$app.typed" "$policy" "$world" "$here/11-compile-driver.js" "$@" > "$out/$tag-$app.json" 2> "$out/$tag-$app.log")
    echo "$tag $app $(cat "$out/$tag-$app.json") $(grep -o 'Collected : .*' "$out/$tag-$app.log")"
}
units "$old"
units "$new"
run control "$old" agenda interactive none tape.js typed-wasm.js typed-rv32.js
run candidate "$new" agenda interactive none tape.js typed-wasm.js typed-rv32.js
run control "$old" chess balanced world tape.js typed-wasm.js typed-async.js typed-rv32.js typed-world.js
run candidate "$new" chess balanced world tape.js typed-wasm.js typed-async.js typed-rv32.js typed-rv32-inline.js typed-world.js
echo "events: Ir Dr Dw I1mr D1mr D1mw ILmr DLmr DLmw"
