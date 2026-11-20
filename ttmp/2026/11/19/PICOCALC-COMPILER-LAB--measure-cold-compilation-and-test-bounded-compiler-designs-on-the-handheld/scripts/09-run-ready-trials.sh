#!/usr/bin/env bash
# A single serial owner runs the already prepared experiments after frontend restoration.
set -euo pipefail
work=$1
port=$2
esptool=$3
shift 3
script_dir=$(dirname "$0")
backend_ready() {
    test -s "$1/build/picocalc-os-p4.bin" &&
        node "$script_dir/03-oracle.mjs" "$1" &&
        test -s "$1/oracle.json"
}
# A prior restoration or an independently checked recovery is required before taking this slot.
for ((attempt=0; attempt<120; attempt++)); do
    if test -s "$work/frontend-board/restored.json"; then break; fi
    sleep 5
done
test -s "$work/frontend-board/restored.json"
for trial in "$@"; do
    path="$work/$trial"
    for ((attempt=0; attempt<120; attempt++)); do
        if test -s "$path/build/picocalc-os-p4.bin"; then break; fi
        sleep 5
    done
    backend_ready "$path"
    python3 -B "$script_dir/04-board.py" "$path" "$work/original" --port "$port" --esptool "$esptool" > "$path/run.log" 2>&1
    python3 -B "$script_dir/05-summarize.py" "$path/physical.json" > "$path/summary.json"
done
