#!/usr/bin/env bash
# From repo root. This regenerates research products in new scratch directories without touching the device.
set -euo pipefail
out=${1:?pass a fresh directory}
mkdir "$out"
out=$(realpath "$out")
here=$(cd "$(dirname "$0")" && pwd)
day=$(cd "$here/../.." && pwd)
sys=( "$day"/PICOCALC-RENDER-SYSTEM--* )
chess=( "$day"/PICOCALC-RENDER-CHESS--* )
snake=( "$day"/PICOCALC-RENDER-SNAKE--* )
binary=( "$day"/PICOCALC-RENDER-BINARY--* )
cf=( ttmp/2026/11/19/PICOCALC-EDITOR-ASYNC--*/scripts/03-check-editor-event-interleaving.mjs )
# Fast path regenerates canonical event and screen fixtures. Each child's full run script adds independent replications.
make -C picocalc-os typed-world-reactor >/dev/null
node "$chess/scripts/07-replay.mjs" "$out/chess"
node "$snake/scripts/07-measure.mjs" "$out/snake"
node "$here/15-editor-holdout.mjs" "${cf[0]}" "$out/editor.ndjson"
refs=( "sysmon=$sys/various/sysmon-generic.ndjson" "chess=$out/chess/control.ndjson" "snake=$out/snake/control.ndjson"
       "keys=$sys/various/keys-generic.ndjson" "editor=$out/editor.ndjson" )
node "$here/11-reader-replay.cjs" "$out/comparison" "${refs[@]}"
node "$here/04-screen-oracle.mjs" "$out/editor.ndjson" "$out/editor-control" --skip-frame 10
node "$here/04-screen-oracle.mjs" "$out/editor.ndjson" "$out/editor-indexed" --indexed --skip-frame 10
cmp "$out/editor-control/receipt.json" "$out/editor-indexed/receipt.json"
node "$here/16-retained-admission.cjs" "$out/ownership.json"
bash "$binary/scripts/05-build-capsule.sh" "$out/binary.js" "$sys/various/sysmon-generic.ndjson" "$out/chess/control.ndjson" "$out/snake/control.ndjson" "$out/editor.ndjson"
node "$here/25-semantic-consumer-check.mjs" "$out/application-consumers.json" "$out/snake" "$out/chess"
