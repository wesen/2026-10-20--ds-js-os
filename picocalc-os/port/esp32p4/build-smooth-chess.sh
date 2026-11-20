#!/usr/bin/env bash
# Run after sourcing the ESP-IDF v5.4.2 environment.
set -euo pipefail
if [[ $# != 1 ]]; then
    echo "usage: build-smooth-chess.sh BUILD_DIRECTORY" >&2
    exit 2
fi
port=$(cd "$(dirname "$0")" && pwd)
build=$(realpath -m "$1")
idf_version=$(idf.py --version)
if [[ "$idf_version" != "ESP-IDF v5.4.2" ]]; then
    echo "expected ESP-IDF v5.4.2, found $idf_version" >&2
    exit 2
fi
mkdir -p "$build"
idf.py -C "$port" -B "$build" \
    -D "SDKCONFIG=$build/sdkconfig.smooth-chess" \
    -D "SDKCONFIG_DEFAULTS=$port/sdkconfig.defaults;$port/sdkconfig.smooth-chess" \
    -D PICOCALC_HEADLESS=OFF -D PICOCALC_DEVICE_COMPILER=ON \
    -D PICOCALC_RV32_CHESS=ON -D PICOCALC_RV32_AGENDA=ON \
    -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_RV32_STREAM_FUNCTIONS=ON -D PICOCALC_AGENT_WIFI=OFF \
    -D PICOCALC_MOBILE_PAINTER=ON -D PICOCALC_CHESS_3D=ON build
sha256sum "$build/picocalc-os-p4.bin" "$build/partition_table/partition-table.bin"
