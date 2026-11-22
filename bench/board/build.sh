#!/usr/bin/env bash
# Build the diagnostic board app for a staged study, after sourcing ESP-IDF v5.4.2 (or pass IDF_EXPORT=...).
#
#   bench/board/build.sh OUT        OUT is stage.mjs's output directory; the app is OUT/build/simd-lab.bin
#
# The app (bench/board/app) times the firmware's C ray tracer (picocalc-os/nucleus/raytrace_demo.c, included as
# production.inc), the C shadow predicates, every mode's RV32 images (OUT/generated/blobs.S) and QuickJS cold
# compiles of each mode, in balanced orders, and prints SHROW/SHCOLD lines between SIMDLAB BEGIN and END.
set -euo pipefail
out=$(realpath -m "${1:?usage: build.sh OUT (a directory staged by stage.mjs)}")
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
app=$root/bench/board/app
os=$root/picocalc-os
[[ -f $out/generated/manifest.json ]] || { echo "$out is not staged: run bench/board/stage.mjs STUDY.json $out" >&2; exit 2; }
if ! command -v idf.py > /dev/null; then source "${IDF_EXPORT:-$HOME/esp/esp-idf-5.4.2/export.sh}" > /dev/null; fi
main=$out/main
mkdir -p "$main/quickjs"
cp "$app"/{CMakeLists.txt,sdkconfig.defaults} "$os/port/esp32p4/partitions.csv" "$out/"
cp "$app"/main/{CMakeLists.txt,bench.c,cold.c,layout.inc} "$os/port/esp32p4/main/p4_compat.h" "$main/"
cp "$os"/third_party/quickjs/{*.h,quickjs.c,dtoa.c,cutils.c,libregexp.c,libunicode.c,VERSION} "$main/quickjs/"
cp "$out"/generated/{inputs.h,cold_inputs.h,blobs.S} "$main/"
cp "$os/nucleus/raytrace_demo.c" "$main/production.inc"
cp "$os"/nucleus/{raytrace_demo.h,raytrace_demo_pie.S} "$main/"
cd "$out"
if [[ ! -e sdkconfig ]]; then idf.py set-target esp32p4; fi
idf.py reconfigure build
sha256sum build/simd-lab.bin
