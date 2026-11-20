#!/usr/bin/env bash
# Replay the fast candidate only if its median clears the professor's cold bound.
set -euo pipefail
work=$1
esptool=$2
lock=$3
root=$(git rev-parse --show-toplevel)
q=("$root"/ttmp/2026/11/19/PICOCALC-EG-QUAL--*/scripts)
for ((i=0;i<1440;i++)); do
    if jq -e '.restored' "$work/async-index-cold/physical.json" >/dev/null 2>&1; then
        read -r selected median_us < <(jq -r '
            [.lanes | to_entries[] | select(.value.boots|length==3) |
                {name:.key,median:(.value.boots|map(.us)|sort|.[1])}] |
            if length==2 then min_by(.median)|[.name,.median]|@tsv else empty end
        ' "$work/async-index-cold/physical.json")
        manual=$(jq -re '[.trials[]|select(.engine=="rv32")|.compiles[-1].us] |
                           if length==3 then sort|.[1] else empty end' "$work/pre-g/board/physical.json")
        if ((10*median_us > 11*manual)); then
            echo "Full replay awaits a candidate meeting the cold threshold: median $median_us us"
            exit 0
        fi
        case "$selected" in
            indexed-prepass) lane=native-index-prepass ;;
            indexed-spans) lane=native-index-span ;;
            *) exit 2 ;;
        esac
        flock "$lock" python3 -B "${q[0]}/03-board-qualification.py" --kind candidate \
            --images "$work/$lane/fixed-wall" --output "$work/$lane/board" --backup "$work/original" \
            --port /dev/ttyACM0 --esptool "$esptool"
        python3 -B "${q[0]}/11-compare-workflows.py" "$work" "$work/$lane/board/comparison.json" --candidate-lane "$lane"
        exit 0
    fi
    sleep 5
done
exit 1
