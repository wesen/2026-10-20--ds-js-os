#!/usr/bin/env bash
# Build a staged A6 or A7 board-trial directory using the specified ESP-IDF export script.
set -eo pipefail
work=$(realpath "$1")
source "$2"
project="$work/tree/picocalc-os/port/esp32p4"
idf.py -C "$project" -B "$work/build" -D "SDKCONFIG=$project/sdkconfig.agent-elf" \
    -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_RV32_AGENDA=ON -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_STREAM_FUNCTIONS=ON \
    -D PICOCALC_DEVICE_COMPILER=ON -D PICOCALC_COMPILER_PROFILE=ON -D PICOCALC_HEADLESS=OFF build
