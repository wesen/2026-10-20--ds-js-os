#!/usr/bin/env bash
# Re-run the full 64 KiB workload on the exact portable compiler selected for integration.
set -euo pipefail
wave=$1
idf=$2
esptool=$3
lock=$4
lane="$wave/host-rehearsal-portable"
here=$(cd "$(dirname "$0")" && pwd)
until [[ -s "$lane/fixed-wall/rv32/sdkconfig" ]] &&
      ! tmux -L pico-eg has-session -t shipping-portable-build 2>/dev/null; do sleep 5; done
python3 -B "$here/06-prepare-observer.py" "$lane" "$idf"
until [[ -s "$lane/board/comparison.json" ]]; do sleep 5; done
jq -e '(.gates|length==5) and all(.gates[]; . == true)' "$lane/board/comparison.json" >/dev/null
flock "$lock" python3 -B "$here/07-time-find.py" --kind candidate --images "$lane/observer" \
    --output "$lane/search" --backup "$wave/original" --esptool "$esptool" --port /dev/ttyACM0
MPLCONFIGDIR="$wave/plot-cache" python3 -B "$here/16-compare-search.py" "$wave/pre-g/search" \
    "$lane/search" "$lane/search/comparison.json" --plot "$lane/search/clocks.png"
