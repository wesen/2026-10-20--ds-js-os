#!/usr/bin/env bash
# Named, non-PIE executable is prepared by 12-host-instructions.sh.
set -euo pipefail
out=$(realpath "$1")
src=$(realpath "$(dirname "$0")")
cc -Wall -Wextra -O2 -fPIC -shared "$src/sample.c" -o "$out/sample.so"
for world in files agenda; do
    stem="$out/$world.cpu"
    LD_PRELOAD="$out/sample.so" "$out/stage1-named" -C -g -h 8388608 -H 8388608 -- \
        "picocalc-os/js/apps/$world.js" --world-unit 3>"$stem.pcs" > "$stem.ir" 2> "$stem.log"
    cmp "$out/$world.ref" "$stem.ir"
    python3 "$src/report.py" "$out/stage1-named" "$stem.pcs" > "$stem.json"
done
