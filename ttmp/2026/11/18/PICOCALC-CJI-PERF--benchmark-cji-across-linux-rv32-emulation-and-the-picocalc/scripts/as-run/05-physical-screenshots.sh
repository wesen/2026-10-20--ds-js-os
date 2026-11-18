#!/usr/bin/env bash
set -euo pipefail
cd /home/manuel/code/wesen/2026-10-20--ds-js-os
while tmux has-session -t '=cji-perf-board' 2>/dev/null; do sleep 8; done
scripts=(ttmp/2026/11/18/*CJI-PERF--*/scripts)
python3 "${scripts[0]}/09-board-report.py" /tmp/nov18-perf-board > /tmp/nov18-perf-board/report.json
python3 -c 'import json; assert json.load(open("/tmp/nov18-perf-board/report.json"))["agenda_10_vs_8"]["n_10"]'
bash "${scripts[0]}/figures/capture-device.sh" /tmp/nov18-p4-report-shots
