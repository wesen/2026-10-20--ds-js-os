#!/usr/bin/env bash
# Qualify the portable frontend after the selected span compiler and reserved Chess trial.
set -euo pipefail
wave=$1
chess_receipt=$2
esptool=$3
lock=$4
lane=host-rehearsal-portable
here=$(cd "$(dirname "$0")" && pwd)
for ((attempt=0;attempt<1440;attempt++)); do
    if [[ -s "$wave/$lane/fixed-wall/rv32/sdkconfig" ]] &&
       jq -e '.restored' "$chess_receipt" >/dev/null 2>&1 &&
       jq -e '.restored' "$wave/host-rehearsal-span/board/physical.json" >/dev/null 2>&1; then
        flock "$lock" python3 -B "$here/03-board-qualification.py" --kind candidate \
            --images "$wave/$lane/fixed-wall" --output "$wave/$lane/board" \
            --backup "$wave/original" --port /dev/ttyACM0 --esptool "$esptool"
        python3 -B "$here/11-compare-workflows.py" "$wave" "$wave/$lane/board/comparison.json" --candidate-lane "$lane"
        exit 0
    fi
    sleep 5
done
exit 1
