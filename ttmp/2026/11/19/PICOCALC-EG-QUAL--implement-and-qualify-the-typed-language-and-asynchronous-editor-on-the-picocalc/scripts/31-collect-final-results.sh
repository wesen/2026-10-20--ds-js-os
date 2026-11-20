#!/usr/bin/env bash
# Verify and archive the integrated portable compiler's two physical experiments.
set -euo pipefail
wave=$1
tree=$2
stage=$3
lane="$wave/host-rehearsal-portable"
here=$(cd "$(dirname "$0")" && pwd)
out=$(dirname "$here")/various
export MPLCONFIGDIR="$wave/plot-cache"
case "$stage" in
    workflow)
        python3 -B "$here/11-compare-workflows.py" "$wave" "$out/workflow-portable.json" --candidate-lane host-rehearsal-portable
        python3 -B "$here/28-check-qualified-integration.py" "$tree" "$lane" "$out/integration-portable.json"
        cp "$lane/board/physical.json" "$out/physical-portable.json"
        python3 -B "$here/13-plot-workflows.py" "$out/workflow-portable.json" "$out/portable-workflow-clocks.png"
        ;;
    search)
        python3 -B "$here/16-compare-search.py" "$wave/pre-g/search" "$lane/search" "$out/search-portable-comparison.json" --plot "$out/portable-search-clocks.png"
        python3 -B "$here/28-check-qualified-integration.py" "$tree" "$lane" "$out/final-acceptance.json" --final
        cp "$lane/search/physical.json" "$out/search-portable.json"
        cp "$lane/search/rv321/late.png" "$out/portable-editor-tail.png"
        ;;
    *) echo 'Choose workflow or search.' >&2; exit 2 ;;
esac
