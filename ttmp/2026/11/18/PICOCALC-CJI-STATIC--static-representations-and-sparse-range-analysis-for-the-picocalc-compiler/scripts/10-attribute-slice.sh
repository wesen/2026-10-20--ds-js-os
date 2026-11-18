#!/usr/bin/env bash
# Count x86 instructions inside the entire slice specialization, including callees.
set -euo pipefail
named=${1:?guarded named directory}
out=${2:?scratch directory}
mkdir -p "$out"
for world in agenda files; do
    valgrind --tool=callgrind --callgrind-out-file="$out/$world.cg" "$named/stage1-named" -C -g -h 8388608 -H 8388608 -- "picocalc-os/js/apps/$world.js" --world-unit > "$out/$world.ir" 2> "$out/$world.log"
    cmp "$out/$world.ir" "$named/$world.ref"
    callgrind_annotate --auto=no --inclusive=yes --threshold=100 "$out/$world.cg" > "$out/$world.txt"
    grep -E 'PROGRAM TOTALS|:slice\.4604fbb68ec0( |$)' "$out/$world.txt" > "$out/$world.slice"
    test "$(wc -l < "$out/$world.slice")" -eq 2
done
