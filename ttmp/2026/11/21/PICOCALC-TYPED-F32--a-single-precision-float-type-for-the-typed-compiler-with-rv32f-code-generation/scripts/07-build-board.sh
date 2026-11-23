#!/usr/bin/env bash
# Build the fragments board study app staged by 06-stage-board.mjs, with ESP-IDF v5.4.2 (or IDF_EXPORT=...).
#   07-build-board.sh OUT      the app is OUT/build/f32-fragments.bin
set -euo pipefail
out=$(realpath "${1:?usage: 07-build-board.sh OUT}")
if ! command -v idf.py > /dev/null; then source "${IDF_EXPORT:-$HOME/esp/esp-idf-5.4.2/export.sh}" > /dev/null; fi
cd "$out"
if [[ ! -e sdkconfig ]]; then idf.py set-target esp32p4 > /dev/null; fi
idf.py build > build.log 2>&1 || { tail -40 build.log; exit 1; }
sha256sum build/f32-fragments.bin
