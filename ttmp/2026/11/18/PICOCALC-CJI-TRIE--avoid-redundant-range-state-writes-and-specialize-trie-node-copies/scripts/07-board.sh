#!/usr/bin/env bash
# Serial use requires exclusive ownership of the board. Always restore the saved ordinary image.
set -euo pipefail
scratch=$(realpath "${1:?candidate build root}")
ordinary=$(realpath "${2:?ordinary headless snapshot}")
out=$(realpath -m "${3:?new run directory}")
shift 3
p=(ttmp/2026/11/18/*CJI-PERF*/scripts)
condition='Headless P4; keyboard, power, display and compositor omitted'
mkdir "$out"
restore() { bash "$p/18-headless-smoke.sh" "$out/restored" "$ordinary"; }
trap restore EXIT
for variant in "$@"; do
    image="$scratch/firmware/$variant"
    sha256sum --check --status "$image/identities.sha256"
    bash "$p/18-headless-smoke.sh" "$out/$variant" "$image"
    python3 "$p/05-board-runs.py" "$out/$variant" --firmware-elf "$image/picocalc-os-p4.elf" \
        --board-condition "$condition" agenda:8 files:8
    python3 "$p/09-board-report.py" "$out/$variant" > "$out/$variant/qualified.json"
done
