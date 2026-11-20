#!/usr/bin/env bash
# Keep the continuous clock experiment independent from the correctness and component-timing campaign.
set -euo pipefail
primary=$1
endpoint=$2
backup=$3
port=$4
esptool=$5
firmware_sha=$6
here=$(cd "$(dirname "$0")" && pwd)
runner=("$here"/../../PICOCALC-FUNCTION-REBUILD--*/scripts/06-board.py)
for ((attempt=0; attempt<180; attempt++)); do
    if jq -e '.restored and .restored_worlds and (.boots|length==2)' "$primary/physical.json" >/dev/null 2>&1; then
        echo "$firmware_sha  $endpoint/build/picocalc-os-p4.bin" | sha256sum -c -
        exec python3 -B "${runner[0]}" "$endpoint" "$backup" --endpoint --port "$port" --esptool "$esptool"
    fi
    sleep 5
done
echo "main edit qualification did not complete" >&2
exit 1
