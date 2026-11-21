#!/usr/bin/env bash
# Run from the project root AFTER sourcing ESP-IDF 5.4.2's export.sh.
# Usage: bash 06-stage-board.sh {rows|frames|classes} EMPTY_OUTPUT_DIRECTORY
set -euo pipefail
mode=$1
case "$mode" in rows|frames|classes) ;; *) exit 2 ;; esac
out=$(realpath -m "$2")
mkdir "$out" # fresh project: do not mix first- and second-visit sources
here=$(cd "$(dirname "$0")" && pwd)
director=$(realpath "$here/../director")
physics=$(realpath "$here/../physics")
gen="$out/generated"
main="$out/main"
mkdir -p "$gen" "$main/quickjs"
cp "$here/board/CMakeLists.txt" "$here/board/sdkconfig.defaults" picocalc-os/port/esp32p4/partitions.csv "$out/"
cp "$here/board/main/"{main.c,CMakeLists.txt} picocalc-os/port/esp32p4/main/p4_compat.h "$main/"
qjs=picocalc-os/third_party/quickjs
cp "$qjs"/*.h "$qjs"/{quickjs.c,dtoa.c,cutils.c,libregexp.c,libunicode.c,VERSION} "$main/quickjs/"
if [[ "$mode" == classes ]]; then
    echo '#define SIMD_CLASS_TRIAL 1' > "$main/trial.h"
    node "$here/03-ceiling-fixtures.mjs" "$main/ceiling_fixtures.h"
    cp "$here/board/packet_classes.c" "$here/board/main/ceiling_reduce.S" "$main/"
    (cd "$out" && idf.py set-target esp32p4 && idf.py build)
    exit
fi
node "$director/02-build-heldout.mjs" "$gen"
cp "$gen/director.S" "$main/"
node "$director/04-packet-images.mjs" "$gen"
if [[ "$mode" == rows ]]; then
    echo '#define SIMD_FRAME_TRIAL 0' > "$main/trial.h"
    node "$here/01-emit-typed.mjs" "$gen"
    node "$here/03-ceiling-fixtures.mjs" "$main/ceiling_fixtures.h"
    cp "$here/board/main/"{ceiling.c,ceiling_reduce.S} "$gen/"{typed-images.S,packet_extras.S} "$main/"
    cp ttmp/2026/11/21/PICOCALC-ROW-IR--*/scripts/01-row.c "$main/checked_reference.c"
    node "$physics/02-build-typed.mjs" "$physics/physics.typed" "$gen"
    cp "$physics/board/"{physics_bench.c,physics_checked.S} "$gen/physics-typed.S" "$physics/physics.S" "$main/"
    python3 "$director/03-pack-board.py" "$gen"
    cp "$gen/"{director.c,director_qjs.c,director_inputs.h} "$main/"
else
    echo '#define SIMD_FRAME_TRIAL 1' > "$main/trial.h"
    prefix_dir=$(dirname "$(command -v riscv32-esp-elf-as)")
    node "$here/04-static-proof.mjs" "$gen" "$prefix_dir/riscv32-esp-elf"
    cp "$here/board/proof_bench.c" "$gen/proof_images.S" "$main/"
    node "$director/06-frame-images.mjs" "$gen"
    cp "$gen/"{frame_inputs.h,frame.S} "$director/"{frame.c,gate.c,length_gate.S} "$main/"
fi
(cd "$out" && idf.py set-target esp32p4 && idf.py build)
