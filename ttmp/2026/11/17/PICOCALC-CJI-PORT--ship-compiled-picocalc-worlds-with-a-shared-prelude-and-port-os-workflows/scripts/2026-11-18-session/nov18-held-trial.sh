#!/bin/bash
set -euo pipefail
cd /home/manuel/code/wesen/2026-10-20--ds-js-os
# Use one serial reader throughout each compile.
runner=(ttmp/2026/11/17/PICOCALC-CJI-PORT--*/scripts/07-check-bundled-catalog.py)
python3 "${runner[0]}" --timeout 7200 agenda >/tmp/nov18-held-agenda.jsonl 2>/tmp/nov18-held-agenda.log
python3 "${runner[0]}" sandbox >/tmp/nov18-held-sandbox.jsonl 2>/tmp/nov18-held-sandbox.log
