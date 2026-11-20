#!/usr/bin/env bash
# Time mature follow-up candidates using the same scheduled reboot and image validation.
set -euo pipefail
work=$1
esptool=$2
lock=$3
root=$(git rev-parse --show-toplevel)
q=("$root"/ttmp/2026/11/19/PICOCALC-EG-QUAL--*/scripts)
for ((i=0;i<1440;i++)); do
    if ! tmux -L pico-eg has-session -t find-staged-retry 2>/dev/null &&
       jq -e '.restored' "$work/index-cold/physical.json" >/dev/null 2>&1 &&
       [[ -s "$work/native-index-prepass/fixed-wall/rv32/sdkconfig" &&
          -s "$work/native-index-span/fixed-wall/rv32/sdkconfig" ]]; then
        exec flock "$lock" python3 -B "${q[0]}/21-run-cold-matrix.py" \
            --output "$work/async-index-cold" --backup "$work/original" --esptool "$esptool" \
            --lane indexed-prepass "$work/native-index-prepass/fixed-wall/rv32" \
            --lane indexed-spans "$work/native-index-span/fixed-wall/rv32"
    fi
    sleep 5
done
exit 1
