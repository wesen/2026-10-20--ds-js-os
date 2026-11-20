#!/usr/bin/env bash
# Collect compact results and selected test screenshots as the separate physical series finish.
set -euo pipefail
work=$1
final=$2
scripts=$(cd "$(dirname "$0")" && pwd)
ticket=$(dirname "$scripts")
export MPLCONFIGDIR="$work/plot-cache"
mkdir -p "$MPLCONFIGDIR"
wait_series() {
    local result=$1 minimum=$2
    for ((attempt=0;attempt<1440;attempt++)); do
        if jq -e --argjson minimum "$minimum" '.restored and (.trials | length >= $minimum)' \
            "$result" >/dev/null 2>&1; then return; fi
        sleep 5
    done
    return 1
}
wait_series "$work/pre-g/board/physical.json" 6
cp "$work/pre-g/board/physical.json" "$ticket/various/physical-before-g.json"
wait_series "$work/$final/board/physical.json" 6
cp "$work/$final/board/physical.json" "$ticket/various/physical-final.json"
python3 -B "$scripts/11-compare-workflows.py" "$work" "$ticket/various/workflow-comparison.json" --candidate-lane "$final"
python3 -B "$scripts/13-plot-workflows.py" "$ticket/various/workflow-comparison.json" "$ticket/various/workflow-clocks.png"
cp "$work/$final/board/trial-1/rv32/shot-1.png" "$ticket/various/editor-physical-find.png"
cp "$work/$final/board/trial-1/rv32/shot-2.png" "$ticket/various/editor-physical-preview.png"
wait_series "$work/pre-g/search/physical.json" 2
cp "$work/pre-g/search/physical.json" "$ticket/various/search-before-g.json"
wait_series "$work/$final/search/physical.json" 2
cp "$work/$final/search/physical.json" "$ticket/various/search-final.json"
python3 -B "$scripts/16-compare-search.py" "$work/pre-g/search" "$work/$final/search" \
    "$ticket/various/search-comparison.json" --plot "$ticket/various/search-clocks.png"
python3 -B "$scripts/17-write-measurement-evidence.py" "$ticket/various/workflow-comparison.json" \
    "$ticket/various/search-comparison.json" "$ticket/sources/verified/editor.md"
cp "$work/$final/search/rv321/late.png" "$ticket/various/editor-physical-tail.png"
