#!/usr/bin/env bash
set -euo pipefail
work=$1
idf_root=$2
port="$work/tree/picocalc-os/port/esp32p4"
source "$idf_root/export.sh"
idf.py -C "$port" -B "$work/build" -DSDKCONFIG="$port/sdkconfig.agent-elf" -DPICOCALC_AGENT_WIFI=ON -DPICOCALC_RV32_AGENDA=ON -DPICOCALC_RV32_FILES=ON -DPICOCALC_RV32_EDITOR=ON -DPICOCALC_RV32_STREAM_FUNCTIONS=ON -DPICOCALC_DEVICE_COMPILER=ON -DPICOCALC_COMPILER_PROFILE=ON -DPICOCALC_HEADLESS=OFF build
