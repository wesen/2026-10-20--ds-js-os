#!/usr/bin/env bash
# Turn the reviewed production integration checkout into the final qualification images.
set -euo pipefail
wave=$1
lane=$2
idf=$3
case "$lane" in host-rehearsal-prepass|host-rehearsal-span) ;; *) exit 2 ;; esac
here=$(cd "$(dirname "$0")" && pwd)
receipt="$wave/$lane/receipt.json"
jq -e '.exit==0 and (.replays|length==24) and all(.replays[]; startswith("PASS "))' "$receipt" >/dev/null
rev=$(jq -er .base "$receipt")
bash "$here/02-prepare-images.sh" "$wave" "$rev" "$idf" "$lane"
python3 -B "$here/09-fixed-wall-images.py" "$wave/$lane" "$idf"
