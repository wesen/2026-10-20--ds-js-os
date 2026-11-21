#!/usr/bin/env bash
# From the repo root with IDF 5.4.2 active. Use a dedicated build directory.
set -euo pipefail
out=$(realpath -m "${1:?build directory}")
shift
here=$(cd "$(dirname "$0")" && pwd)
old=(ttmp/2026/11/21/PICOCALC-SIMD-LAB--*/scripts/ray/board)
main="$out/main"
mkdir -p "$out/generated" "$main/quickjs"
node "$here/01-images.mjs" "$out/generated" "$@"
cp "${old[0]}"/{CMakeLists.txt,sdkconfig.defaults} picocalc-os/port/esp32p4/partitions.csv "$out/"
cp "${old[0]}/main/CMakeLists.txt" picocalc-os/port/esp32p4/main/p4_compat.h "$main/"
cp picocalc-os/third_party/quickjs/{*.h,quickjs.c,dtoa.c,cutils.c,libregexp.c,libunicode.c,VERSION} "$main/quickjs/"
cp "$out/generated"/{inputs.h,cold_inputs.h,blobs.S} "$here"/{cold.c,bench.c,layout.inc} "$main/"
cp picocalc-os/nucleus/raytrace_demo.c "$main/production.inc"
cp picocalc-os/nucleus/{raytrace_demo.h,raytrace_demo_pie.S} "$main/"
cd "$out"
if [[ ! -e sdkconfig ]]; then idf.py set-target esp32p4; fi
idf.py reconfigure build
