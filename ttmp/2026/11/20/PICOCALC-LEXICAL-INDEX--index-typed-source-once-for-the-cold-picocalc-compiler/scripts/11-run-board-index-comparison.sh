#!/usr/bin/env bash
# Run both pure compiler changes after the scheduled Editor sensory workload.
set -euo pipefail
work=$1
esptool=$2
lock=$3
root=$(git rev-parse --show-toplevel)
qualification=("$root"/ttmp/2026/11/19/PICOCALC-EG-QUAL--*/scripts)
for ((i=0;i<1440;i++)); do
    if ! tmux -L pico-eg has-session -t search-retry 2>/dev/null &&
       jq -e '.restored' "$work/phase-cold/physical.json" >/dev/null 2>&1 &&
       [[ -s "$work/native-index-final/fixed-wall/rv32/sdkconfig" &&
          -s "$work/native-index-reuse/fixed-wall/rv32/sdkconfig" ]]; then
        exec flock "$lock" python3 -B "${qualification[0]}/21-run-cold-matrix.py" \
            --output "$work/index-cold" --backup "$work/original" --esptool "$esptool" \
            --lane index "$work/native-index-final/fixed-wall/rv32" \
            --lane index-reuse "$work/native-index-reuse/fixed-wall/rv32"
    fi
    sleep 5
done
exit 1
