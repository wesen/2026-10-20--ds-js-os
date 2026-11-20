#!/usr/bin/env bash
# Build the normal peripheral-enabled four-app image from the current checkout.
set -euo pipefail
out=$1
idf_export=$2
root=$(git rev-parse --show-toplevel)
port=$root/picocalc-os/port/esp32p4
mkdir -p "$out"
cp "$port/sdkconfig.agent-elf" "$out/sdkconfig"
source "$idf_export"
idf.py -C "$port" -B "$out/build" -D "SDKCONFIG=$out/sdkconfig" \
  -D PICOCALC_HEADLESS=OFF -D PICOCALC_DEVICE_COMPILER=ON \
  -D PICOCALC_RV32_CHESS=ON -D PICOCALC_RV32_AGENDA=ON \
  -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_FILES=ON \
  -D PICOCALC_RV32_STREAM_FUNCTIONS=ON -D PICOCALC_AGENT_WIFI=OFF build
