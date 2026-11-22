#!/usr/bin/env bash
# 07-stage-board.sh: stage and build the Candela benchmark app (ESP-IDF 5.4.2).
#
#   source /home/manuel/esp/esp-idf-5.4.2/export.sh
#   bash 07-stage-board.sh CDL_BUILD MODE NEW_OUTPUT_DIRECTORY
#
# CDL_BUILD is 04-build.py's build directory after its rv32 and board targets; MODE is 1 (timing) or 2
# (64 spp images). The output directory must not exist: every build starts from fresh sources. The app is
# OUT/build/candela-bench.bin; 09-run-board.py flashes it at 0x10000 only.
set -euo pipefail
cdl=$(realpath "$1"); mode=$2; out=$(realpath -m "$3")
case "$mode" in 1|2) ;; *) echo "MODE must be 1 or 2" >&2; exit 2 ;; esac
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../../.." && pwd)
[[ -f "$repo/picocalc-os/port/esp32p4/partitions.csv" ]] || { echo "repository not found from $here" >&2; exit 2; }
[[ "$(idf.py --version)" == "ESP-IDF v5.4.2" ]] || { echo "source ESP-IDF 5.4.2's export.sh first" >&2; exit 2; }
mkdir "$out"
mkdir "$out/main"
cp "$here/board/CMakeLists.txt" "$here/board/sdkconfig.defaults" "$repo/picocalc-os/port/esp32p4/partitions.csv" "$out/"
cp "$here/board/main/"{CMakeLists.txt,bench.c,microbench.c,registry.h} "$here/cpu/cdl_api.h" "$out/main/"
cp "$cdl/board/"{registry.c,blobs.S,libcdl.a,arms.json} "$out/main/"
echo "#define CDL_BENCH_MODE $mode" > "$out/main/mode.h"
cd "$out"
idf.py set-target esp32p4
idf.py build
sha256sum build/candela-bench.bin
