#!/usr/bin/env bash
# Workstation launch manifest. Wait passively until the preceding serial owner exits.
set -euo pipefail
cd /home/manuel/code/wesen/2026-10-20--ds-js-os
while tmux has-session -t '=cji-held-trial' 2>/dev/null; do sleep 10; done
test -s /tmp/nov18-held-sandbox.jsonl
port=(ttmp/2026/11/17/*CJI-PORT--*/scripts/2026-11-18-session)
perf=(ttmp/2026/11/18/*CJI-PERF--*/scripts)
python3 "${port[0]}/nov18-persist-held.py"
bash "${perf[0]}/06-board-experiment.sh" /tmp/nov18-perf-board picocalc-os/port/esp32p4/build-elf /home/manuel/.espressif/python_env/idf5.4_py3.13_env/bin/esptool.py files:8 agenda:8 agenda:10
