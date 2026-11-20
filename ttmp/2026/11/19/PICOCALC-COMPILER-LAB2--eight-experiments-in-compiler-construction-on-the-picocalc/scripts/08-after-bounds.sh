#!/usr/bin/env bash
# Keep the single board in named trials while independent host reports continue.
set -euo pipefail
root=$1
port=$2
tool=$3
bounds=$4
day=$(dirname "$(dirname "$(dirname "$0")")")
for ((try=0; try<300; try++)); do
  if python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(not (d.get("restored") and len(d.get("boots",[]))==2))' "$bounds/physical.json" 2>/dev/null; then
    break
  fi
  sleep 15
done
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["restored"] and len(d["boots"])==2' "$bounds/physical.json"
await_runner=("$day"/PICOCALC-EDITOR-AWAIT--*/scripts/07-board.py)
flock "$root/original/serial.lock" python3 -B "${await_runner[0]}" "$root/await-board" "$root/original" "$root/await-physical" --port "$port" --esptool "$tool"
