#!/usr/bin/env bash
# Build the same three-world firmware with buffered or streamed native functions.
set -eo pipefail
if [[ $# != 5 ]]; then
    echo "Usage: bash $0 IDF_EXPORT SDKCONFIG BUILD_DIRECTORY buffered|streamed IMAGE_DIRECTORY" >&2
    exit 2
fi
idf_export=$1
sdkconfig=$(realpath "$2")
build=$(realpath -m "$3")
case $4 in
    buffered) streaming=OFF ;;
    streamed) streaming=ON ;;
    *) exit 2 ;;
esac
output=$(realpath -m "$5")
source "$idf_export"
set -u
idf.py -C picocalc-os/port/esp32p4 -B "$build" -D "SDKCONFIG=$sdkconfig" \
    -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_DEVICE_COMPILER=ON -D PICOCALC_COMPILER_PROFILE=ON \
    -D PICOCALC_HEADLESS=OFF -D PICOCALC_RV32_FILES=ON -D PICOCALC_RV32_AGENDA=ON \
    -D PICOCALC_RV32_EDITOR=ON -D "PICOCALC_RV32_STREAM_FUNCTIONS=$streaming" build
mkdir -p "$output"
cp "$build/picocalc-os-p4.bin" "$build/partition_table/partition-table.bin" "$output/"
