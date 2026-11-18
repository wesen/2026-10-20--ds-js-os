#!/usr/bin/env bash
# Diagnostic only. --stats forces a collection at each report; keep separate from the timing matrix.
set -euo pipefail
out=$(realpath "$1")
for world in files agenda; do
    "$out/stage1-plain" -C -h 8388608 -H 8388608 -- "picocalc-os/js/apps/$world.js" --world-unit --stats \
        > "$out/$world.pass.ir" 2> "$out/$world.pass.log"
    cmp "$out/$world.ref" "$out/$world.pass.ir"
done
