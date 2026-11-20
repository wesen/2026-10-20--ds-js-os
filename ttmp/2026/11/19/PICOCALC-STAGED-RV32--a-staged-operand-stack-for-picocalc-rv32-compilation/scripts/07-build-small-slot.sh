#!/usr/bin/env bash
set -eo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(realpath "$2")
test -d "$work/tree" || python3 -B "$here/06-stage-small-slot.py" "$1" "$work"
source "$3"
project="$work/tree/picocalc-os/port/esp32p4"
idf.py -C "$project" -B "$work/build" -D "SDKCONFIG=$project/sdkconfig.agent-elf" \
    -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_RV32_AGENDA=ON -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_STREAM_FUNCTIONS=ON \
    -D PICOCALC_DEVICE_COMPILER=ON -D PICOCALC_COMPILER_PROFILE=ON -D PICOCALC_HEADLESS=OFF build
