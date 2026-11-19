#!/usr/bin/env bash
# Run from the repository root. WORK is an empty scratch area shared with the backup and trial tools.
set -euo pipefail
here=$(dirname "$0")
work=$(realpath "$1")
idf_export=$2
python3 -B "$here/p4-trial-build.py" "$work/tree" "${@:3}"
set +u
source "$idf_export"
set -u
project="$work/tree/picocalc-os/port/esp32p4"
idf.py -C "$project" -B "$work/build" -D "SDKCONFIG=$project/sdkconfig.agent-elf" \
    -D PICOCALC_AGENT_WIFI=ON -D PICOCALC_RV32_AGENDA=ON -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_DEVICE_COMPILER=ON -D PICOCALC_COMPILER_PROFILE=ON \
    -D PICOCALC_HEADLESS=OFF build
