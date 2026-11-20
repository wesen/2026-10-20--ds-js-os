#!/usr/bin/env bash
# Qualify the Editor edit, register locals and bounds studies through their own oracles.
set -euo pipefail
day=$(dirname "$(dirname "$(dirname "$0")")")
root=$1
port=$2
tool=$3
shift 3
inc=$1
regs=$2
bounds=$3
edit_runner=("$day"/PICOCALC-EDITOR-FRAGMENTS--*/scripts/06-physical.py)
locals_runner=("$day"/PICOCALC-REGISTER-LOCALS--*/scripts/07-board.py)
bounds_runner=("$day"/PICOCALC-BOUNDED-INDEX--*/scripts/10-summarize-board.py)
lab_runner=("$day"/PICOCALC-COMPILER-LAB--*/scripts/04-board.py)
python3 -B "${edit_runner[0]}" "$inc" "$root/original" --port "$port" --esptool "$tool" > "$inc/board-run.log" 2>&1
flock "$root/original/serial.lock" python3 -B "${locals_runner[0]}" "$regs" "$root/original" --port "$port" --esptool "$tool" > "$regs/board-run.log" 2>&1
flock "$root/original/serial.lock" python3 -B "${lab_runner[0]}" "$bounds" "$root/original" --port "$port" --esptool "$tool" > "$bounds/board-run.log" 2>&1
python3 -B "${bounds_runner[0]}" "$bounds" > "$bounds/summary.json"
