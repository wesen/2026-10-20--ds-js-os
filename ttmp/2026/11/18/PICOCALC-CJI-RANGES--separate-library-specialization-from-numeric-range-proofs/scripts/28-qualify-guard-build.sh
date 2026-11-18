#!/usr/bin/env bash
# Start after the guarded bootstrap has produced its executable; ESP-IDF must be initialized.
set -euo pipefail
root=$(realpath "${1:?experiment directory}")
base=$(realpath "${2:?original host benchmark directory}")
scripts=$(realpath "$(dirname "$0")")
perf=(ttmp/2026/11/18/*CJI-PERF--*/scripts)
bash "${perf[0]}/22-board-variant.sh" "$root/guard" "$root/guard/stage1.slir"
bash "$scripts/25-time-deferred.sh" "$base" "$root/guard"
python3 "${perf[0]}/16-candidate-report.py" "$base" guard --case-dir "$root/guard" > "$root/guard/native.json"
