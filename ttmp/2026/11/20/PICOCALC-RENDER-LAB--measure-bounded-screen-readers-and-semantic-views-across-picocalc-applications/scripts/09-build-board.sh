#!/usr/bin/env bash
set -eo pipefail
work=$(realpath "$1")
. "${2:-/home/manuel/esp/esp-idf-5.4.2/export.sh}" >/dev/null
port="$work/tree/picocalc-os/port/esp32p4"
idf.py -C "$port" -B "$work/build" -D "SDKCONFIG=$port/sdkconfig.agent-elf" \
  -D PICOCALC_HEADLESS=OFF -D PICOCALC_DEVICE_COMPILER=ON -D PICOCALC_RV32_CHESS=ON \
  -D PICOCALC_RV32_AGENDA=ON -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_FILES=ON \
  -D PICOCALC_RV32_STREAM_FUNCTIONS=ON -D PICOCALC_AGENT_WIFI=OFF build
