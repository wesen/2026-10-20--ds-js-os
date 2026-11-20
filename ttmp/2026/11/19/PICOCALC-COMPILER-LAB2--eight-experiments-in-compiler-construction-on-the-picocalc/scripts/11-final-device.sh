#!/usr/bin/env bash
# Complete the planner transfer and then measure component interaction in a clean, final P4 run.
set -euo pipefail
root=$1
port=$2
tool=$3
selector=$4
combined=$5
day=$(dirname "$(dirname "$(dirname "$0")")")
await_receipt="$root/await-physical/physical.json"
ready() {
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(not (d["restored"] and d.get("all_observable_outcomes_identical") and all(len(d["lanes"][a])==2 for a in ("manual","await"))))' "$await_receipt" 2>/dev/null
}
for ((attempt=0;attempt<300;attempt++)); do
  if ready; then break; fi
  sleep 15
done
ready
select_runner=("$day"/PICOCALC-ANALYSIS-SELECTION--*/scripts/12-p4-board.py)
final_runner=("$day"/PICOCALC-REGISTER-LOCALS--*/scripts/07-board.py)
flock "$root/original/serial.lock" python3 -B "${select_runner[0]}" "$selector" "$root/original" --port "$port" --esptool "$tool" --boots 2 > "$selector/board-run.log" 2>&1
flock "$root/original/serial.lock" python3 -B "${final_runner[0]}" "$combined" "$root/original" --port "$port" --esptool "$tool" --boots 2 > "$combined/board-run.log" 2>&1
python3 -B "$(dirname "$0")/07-combined-results.py" "$combined/physical.json" "$combined/summary-combined.json" --figure "$combined/picocalc-lab2-integrated-results.png"
