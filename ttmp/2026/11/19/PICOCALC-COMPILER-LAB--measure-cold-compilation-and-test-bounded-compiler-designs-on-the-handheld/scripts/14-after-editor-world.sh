#!/usr/bin/env bash
# Run after the previous normal-world check has returned the original firmware and port.
set -euo pipefail
work=$1
incremental=$2
port=$3
esptool=$4
firmware_sha=$5
here=$(cd "$(dirname "$0")" && pwd)
runner=("$here"/../../PICOCALC-FUNCTION-REBUILD--*/scripts/06-board.py)
for ((attempt=0; attempt<360; attempt++)); do
    if jq -e '.restored and .control_after and (.boots|length == 3)' "$work/standard-world/physical.json" >/dev/null 2>&1; then
        echo "$firmware_sha  $incremental/build/picocalc-os-p4.bin" | sha256sum -c -
        exec python3 -B "${runner[0]}" "$incremental" "$work/original" --port "$port" --esptool "$esptool"
    fi
    sleep 5
done
echo "previous qualification did not finish" >&2
exit 1
