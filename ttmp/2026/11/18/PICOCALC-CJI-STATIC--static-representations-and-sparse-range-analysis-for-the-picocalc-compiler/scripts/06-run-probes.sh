#!/usr/bin/env bash
set -euo pipefail
src=$(dirname "$0")
named=${1:?named object directory}
out=${2:?scratch directory}
mkdir -p "$out"
python3 "$src/05-lookup-probes.py" "cji/runtime/runtime.c" "$out/runtime.c"
cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie -DCJI_PROFILE_GC -I"cji/runtime" \
   "cji/runtime/aot_main.c" "$out/runtime.c" "$named/named.o" -lm -o "$out/trace"
for world in agenda files; do
   "$out/trace" -C -g -h 8388608 -H 8388608 -- "picocalc-os/js/apps/$world.js" --world-unit > "$out/$world.ir" 2> "$out/$world.log"
   cmp "$named/$world.ref" "$out/$world.ir"
   grep '^PROBES ' "$out/$world.log"
done
