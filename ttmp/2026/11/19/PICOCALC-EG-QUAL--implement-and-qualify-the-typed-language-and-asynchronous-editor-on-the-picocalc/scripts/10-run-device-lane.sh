#!/usr/bin/env bash
# A board lane starts after its predecessor returned all three original apps.
set -euo pipefail
scripts=$(cd "$(dirname "$0")" && pwd)
work=$1
lane=$2
previous=$3
port=$4
esptool=$5
lock=$6
case "$lane" in
    before-g) images="$work/pre-g/fixed-wall"; result="$work/pre-g/board"; action=03-board-qualification.py; kind=before-g ;;
    candidate) images="$work/candidate/fixed-wall"; result="$work/candidate/board"; action=03-board-qualification.py; kind=candidate ;;
    search-control) images="$work/control/observer"; result="$work/control/search"; action=07-time-find.py; kind=control ;;
    search-candidate) images="$work/candidate/observer"; result="$work/candidate/search"; action=07-time-find.py; kind=candidate ;;
    *) exit 2 ;;
esac
for ((attempt=0;attempt<1440;attempt++)); do
    if jq -e '.restored' "$previous" >/dev/null 2>&1 && [[ -s "$images/rv32/sdkconfig" ]]; then
        exec flock "$lock" python3 -B "$scripts/$action" --kind "$kind" --images "$images" --output "$result" \
            --backup "$work/original" --port "$port" --esptool "$esptool"
    fi
    sleep 5
done
exit 1
