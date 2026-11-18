#!/usr/bin/env bash
# Run after the already-started headless control qualifies. Supply immutable build snapshots.
set -euo pipefail
root=$(realpath "${1:?experiment directory}"); shift
scripts=$(realpath "$(dirname "$0")")
test -s "$root/control/p4-runs.jsonl"
python3 "$scripts/09-board-report.py" "$root/control" > "$root/control/qualified.json"
control="$root/control"
restore() {
    echo "Restoring ordinary headless firmware"
    bash "$scripts/18-headless-smoke.sh" "$root/restored" "$control"
}
trap restore EXIT
condition="Headless P4; keyboard, power, display and compositor omitted"
# The ordinary firmware is still running here, so Files can use the exact same control.
python3 "$scripts/05-board-runs.py" "$root/files-control" --firmware-elf "$control/picocalc-os-p4.elf" \
    --board-condition "$condition" files:8
python3 "$scripts/09-board-report.py" "$root/files-control" > "$root/files-control/qualified.json"
for name in "$@"; do
    image="$root/$name"
    test -s "$image/identities.sha256"
    sha256sum --check --status "$image/identities.sha256"
    run="$root/runs/$name"
    bash "$scripts/18-headless-smoke.sh" "$run" "$image"
    cases=(agenda:8)
    if [[ $name == guard ]]; then cases+=(files:8); fi
    python3 "$scripts/05-board-runs.py" "$run" --firmware-elf "$image/picocalc-os-p4.elf" \
        --board-condition "$condition" "${cases[@]}"
    python3 "$scripts/09-board-report.py" "$run" > "$run/qualified.json"
    echo "$name passed"
done
