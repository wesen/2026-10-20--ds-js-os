#!/usr/bin/env bash
# Use one serial port for the unchanged application and the E5 checkpoint.
set -euo pipefail
scripts=$(cd "$(dirname "$0")" && pwd)
work=$1
device=$2
tool=$3
lock=$4
for lane in control e5; do
  for ((tick=0;tick<240;tick++)); do
    if [[ -s "$work/$lane/images/wasm/sdkconfig" && -s "$work/$lane/images/rv32/sdkconfig" ]]; then break; fi
    sleep 5
  done
  test -s "$work/$lane/images/rv32/sdkconfig"
  flock "$lock" python3 -B "$scripts/03-board-qualification.py" --images "$work/$lane/images" \
       --kind "$lane" --output "$work/$lane/board" --backup "$work/original" --port "$device" --esptool "$tool"
done
