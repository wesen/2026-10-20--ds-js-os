#!/usr/bin/env bash
# Separate demonstration after completing the benchmark and resetting to normal boot.
# Retain private raw UART locally. Inspect each decoded screenshot before publishing.
set -euo pipefail
out=$(realpath -m "$1")
mkdir -p "$out"
python3 picocalc-os/tools/p4cap.py --no-reset -s 57 --shot-dir "$out" \
    -c '1 key f1' -c '3 shot' -c '11 key l' -c '13 key f2' -c '14 key f2' \
    -c '16 cji check drivers/keyboard.js' -c '28 shot' -c '43 shot' -c '54 key f1' > "$out/console.log"
