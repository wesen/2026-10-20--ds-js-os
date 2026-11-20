#!/usr/bin/env bash
# All competing firmware experiments share this serial lock. Preserve the Editor reservation.
set -euo pipefail
wave=$1
image=$2
out=$3
esptool=$4
lock=$5
here=$(cd "$(dirname "$0")" && pwd)
for ((i=0;i<1440;i++)); do
    if ! tmux -L pico-eg has-session -t composed-workflow 2>/dev/null &&
       jq -e '.restored' "$wave/async-index-cold/physical.json" >/dev/null 2>&1; then
        exec flock "$lock" python3 -B "$here/11-run-board-chess.py" \
            --image "$image" --output "$out" --backup "$wave/original" --esptool "$esptool"
    fi
    sleep 5
done
exit 1
