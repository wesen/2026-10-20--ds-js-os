#!/bin/bash
set -euo pipefail
cd /home/manuel/code/wesen/2026-10-20--ds-js-os
# Use one serial reader throughout each compile.
python3 picocalc-os/tools/p4cap.py --no-reset -s 32 -c '0.5 cji check drivers/keyboard.js' -c '3 cji status' -c '27 cji status' | python3 -c 'import sys; [print(l.strip(),flush=True) for raw in sys.stdin.buffer for l in [raw.decode(errors="replace")] if "cji: " in l]' >/tmp/nov18-final-keyboard.log
runner=(ttmp/2026/11/17/PICOCALC-CJI-PORT--*/scripts/07-check-bundled-catalog.py)
python3 "${runner[0]}" --timeout 7200 agenda >/tmp/nov18-final-agenda.jsonl 2>/tmp/nov18-final-agenda.log
python3 "${runner[0]}" sandbox >/tmp/nov18-final-sandbox.jsonl 2>/tmp/nov18-final-sandbox.log
