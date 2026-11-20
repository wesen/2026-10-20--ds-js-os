#!/usr/bin/env bash
# Resume after an interrupted, owned setup. Preserve its failed trial for review.
set -euo pipefail
work=$1
esptool=$2
lock=$3
scripts=$(cd "$(dirname "$0")" && pwd)
old="$work/pre-g/search"
prior="$work/pre-g/search-empty-setup"
if ! jq -e '.restored and (.trials | length == 0)' "$old/physical.json" >/dev/null ||
   [[ -e "$prior" ]] || [[ ! -s "$old/rv321/setup.log" ]]; then
    exit 2
fi
mv "$old" "$prior"
for ((i=0;i<1440;i++)); do
    if jq -e '.restored' "$work/phase-cold/physical.json" >/dev/null 2>&1; then
        args=(--backup "$work/original" --port /dev/ttyACM0 --esptool "$esptool")
        flock "$lock" python3 -B "$scripts/07-time-find.py" --kind control --images "$work/pre-g/observer" \
          --output "$old" --resume-empty "$prior/rv321" "${args[@]}"
        flock "$lock" python3 -B "$scripts/07-time-find.py" --kind candidate --images "$work/candidate-final/observer" \
          --output "$work/candidate-final/search" "${args[@]}"
        exit 0
    fi
    sleep 5
done
exit 1
