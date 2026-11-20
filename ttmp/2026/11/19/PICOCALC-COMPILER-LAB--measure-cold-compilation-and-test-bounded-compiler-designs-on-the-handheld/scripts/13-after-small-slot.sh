#!/usr/bin/env bash
# The earlier queue owns the UART until its final baseline boot has been recorded.
set -euo pipefail
work=$1
port=$2
esptool=$3
firmware_sha=$4
backup_sha=$5
here=$(dirname "$0")
for ((attempt=0; attempt<300; attempt++)); do
    if jq -e '.restored and .control_after and .preview.scratch_removed and .pixels.all_pixels_outside_clock_match' "$work/slot80/physical.json" >/dev/null 2>&1; then
        exec python3 -B "$here/10-small-slot-board.py" "$work/bounded-live" "$work/original" "$work/select-world" \
            --select --port "$port" --esptool "$esptool" --firmware-sha "$firmware_sha" --backup-sha "$backup_sha"
    fi
    sleep 5
done
echo "previous qualification did not finish" >&2
exit 1
