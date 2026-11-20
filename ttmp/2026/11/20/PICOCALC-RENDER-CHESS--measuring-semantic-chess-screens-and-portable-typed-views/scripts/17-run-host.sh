#!/usr/bin/env bash
# From any cwd, pass a fresh output directory. Prerequisite: the shared typed reactor.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
out=$(realpath -m "${1:?Pass an output directory}")
mkdir -p "$out"
if [[ -e "$out/replay.json" ]]; then echo "Choose a fresh output directory" >&2; exit 2; fi
cd "$repo"
make -C picocalc-os typed-world-reactor
oracle=(ttmp/2026/11/20/PICOCALC-RENDER-LAB--*/scripts/04-screen-oracle.mjs)
node "$here/07-replay.mjs" "$out"
node "${oracle[0]}" "$out/control.ndjson" "$out/control-pixels"
node "${oracle[0]}" "$out/control-aa.ndjson" "$out/control-aa-pixels"
node "${oracle[0]}" "$out/resident.ndjson" "$out/resident-pixels" --skip-frame 3
python "$here/09-check-pixels.py" "$out"
node "$here/10-measure.mjs" "$out"
for arm in M S; do
    node "${oracle[0]}" "$out/$arm.ndjson" "$out/$arm-pixels"
done
for ((i=0;i<12;i++)); do
    case $((i%3)) in 0) arms=(M S R);; 1) arms=(S R M);; 2) arms=(R M S);; esac
    for arm in "${arms[@]}"; do node "$here/11-cold-install.mjs" "$out" "$arm"; done
done > "$out/cold.ndjson"
python "$here/08-board-fixtures.py" "$out" "$out/chess_fixtures.h"
node "$here/12-board-receive.mjs" "$out" "$out/chess-receive.js"
node "$here/13-board-producers.mjs" "$out"
python "$here/18-summarize.py" "$out"
