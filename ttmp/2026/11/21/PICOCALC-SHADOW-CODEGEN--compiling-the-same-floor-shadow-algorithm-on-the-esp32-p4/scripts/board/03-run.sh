#!/usr/bin/env bash
# Both the preceding playable image and the restored image are verified on flash.
set -euo pipefail
build=${1:?diagnostic build directory}
out=${2:?new directory for raw captures}
restore=${3:?directory containing the playable firmware}
digest=${4:?sha256 of that playable firmware}
runner=(ttmp/2026/11/21/PICOCALC-SIMD-LAB--*/scripts/ray/02-run-board.py)
exec python3 "${runner[0]}" --restore "$restore" --restore-sha "$digest" --port /dev/ttyACM0 \
    --app "$build/simd-lab.bin" --out "$out" --deadline 300
