#!/usr/bin/env bash
set -euo pipefail
src=$(dirname "$0")
named=${1:?directory produced by RANGES script 34}
out=${2:?destination}
mkdir -p "$out"
cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie -DCJI_PROFILE_GC -I"cji/runtime" \
   "cji/runtime/aot_main.c" "cji/runtime/runtime.c" "$named/named.o" "$src/02-count-sites.c" \
   -Wl,--wrap=rt_any_index,--wrap=rt_any_get,--wrap=rt_any_eq -lm -o "$out/trace"
nm -Sn "$out/trace" > "$out/symbols"
for world in agenda files; do
    "$out/trace" -C -g -h 8388608 -H 8388608 -- "picocalc-os/js/apps/$world.js" --world-unit > "$out/$world.ir" 2> "$out/$world.log"
    cmp "$out/$world.ir" "$named/$world.ref"
    python3 "$src/04-summarize-sites.py" "$out" "$world" > "$out/$world.json"
done
