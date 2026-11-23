#!/usr/bin/env bash
# Build the RV32 conformance capture app (bench/board/rv32-vectors) with the current vectors, after sourcing ESP-IDF
# v5.4.2 (or pass IDF_EXPORT=...).
#
#   bench/board/rv32-build.sh OUT      the app is OUT/build/rv32-vectors.bin; OUT/main/cases.json lists its vectors
set -euo pipefail
out=$(realpath -m "${1:?usage: rv32-build.sh OUT}")
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
app=$root/bench/board/rv32-vectors
if ! command -v idf.py > /dev/null; then source "${IDF_EXPORT:-$HOME/esp/esp-idf-5.4.2/export.sh}" > /dev/null; fi
mkdir -p "$out/main"
cp "$app"/{CMakeLists.txt,sdkconfig.defaults} "$root/firmware/port/esp32p4/partitions.csv" "$out/"
cp "$app"/main/{CMakeLists.txt,main.c} "$out/main/"
(cd "$root" && node bench/rv32/vectors.mjs --board "$out/main")
cd "$out"
if [[ ! -e sdkconfig ]]; then idf.py set-target esp32p4; fi
idf.py reconfigure build
sha256sum build/rv32-vectors.bin
