#!/usr/bin/env bash
# Retain the interrupted screenshot and recover the already-owned 64 KiB fixture.
set -euo pipefail
work=$1
esptool=$2
lock=$3
scripts=$(cd "$(dirname "$0")" && pwd)
old="$work/pre-g/search"
partial="$work/pre-g/search-short-shot"
for ((i=0;i<1440;i++)); do
    if jq -e '.restored and (.trials|length==0)' "$old/physical.json" >/dev/null 2>&1 &&
       jq -e '.restored' "$work/index-cold/physical.json" >/dev/null 2>&1; then
        [[ ! -e "$partial" && -s "$old/rv321/staged.log" ]]
        mv "$old" "$partial"
        args=(--backup "$work/original" --port /dev/ttyACM0 --esptool "$esptool")
        flock "$lock" python3 -B "$scripts/07-time-find.py" --kind control --images "$work/pre-g/observer" \
            --output "$old" --resume-empty "$work/pre-g/search-empty-setup/rv321" \
            --resume-staged "$partial/rv321" "${args[@]}"
        flock "$lock" python3 -B "$scripts/07-time-find.py" --kind candidate --images "$work/candidate-final/observer" \
            --output "$work/candidate-final/search" "${args[@]}"
        exit 0
    fi
    sleep 5
done
exit 1
