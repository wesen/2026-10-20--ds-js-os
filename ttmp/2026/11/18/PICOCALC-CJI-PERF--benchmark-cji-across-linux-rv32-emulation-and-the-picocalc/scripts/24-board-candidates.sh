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
for name in "$@"; do
    image="$root/$name"
    test -s "$image/identities.sha256"
    sha256sum --check --status "$image/identities.sha256"
    run="$root/runs/$name"
    bash "$scripts/18-headless-smoke.sh" "$run" "$image"
    python3 "$scripts/05-board-runs.py" "$run" --firmware-elf "$image/picocalc-os-p4.elf" \
        --board-condition "Headless P4; keyboard, power, display and compositor omitted" agenda:8
    python3 "$scripts/09-board-report.py" "$run" > "$run/qualified.json"
    echo "$name passed"
done
