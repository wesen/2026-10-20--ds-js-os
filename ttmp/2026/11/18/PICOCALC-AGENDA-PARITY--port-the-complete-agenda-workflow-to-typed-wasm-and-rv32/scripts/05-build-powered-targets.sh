#!/usr/bin/env bash
# Build from the repository root with the ESP-IDF environment active.
set -euo pipefail
if [[ $# -lt 2 || $# -gt 3 || -z ${IDF_PATH:-} ]]; then
    echo "usage: $0 CONFIGURED_PANEL_BUILD_DIR NEW_OUTPUT_DIRECTORY [EARLY_BOOT=OFF]" >&2
    exit 2
fi
build=$(realpath "$1")
out=$(realpath -m "$2")
early_boot=${3:-OFF}
[[ "$early_boot" == ON || "$early_boot" == OFF ]]
mkdir -- "$out"
make -C picocalc-os agenda-reactor
for target in wasm rv32; do
    rv32=OFF
    if [[ "$target" == rv32 ]]; then rv32=ON; fi
    (cd picocalc-os/port/esp32p4 &&
        idf.py -B "$build" -D PICOCALC_RV32_AGENDA="$rv32" -D PICOCALC_TYPED_AGENDA=ON \
            -D PICOCALC_NATIVE_ELF=ON -D PICOCALC_HEADLESS=OFF -D PICOCALC_COMPILER_PROFILE=ON \
            -D PICOCALC_AGENDA_EARLY_BOOT="$early_boot" build) \
        >"$out/$target-build.log" 2>&1
    cp "$build/picocalc-os-p4.bin" "$out/$target.bin"
    cp "$build/esp-idf/main/system.typed-agenda.json" "$out/$target-manifest.json"
    cp "$build/partition_table/partition-table.bin" "$out/$target-partitions.bin"
    cp "$build/sdkconfig" "$out/$target-sdkconfig"
done
cmp "$out/wasm-sdkconfig" "$out/rv32-sdkconfig"
cmp "$out/wasm-partitions.bin" "$out/rv32-partitions.bin"
sha256sum picocalc-os/worlds/agenda/{reminder.typed,entry.typed,compile.js} >"$out/sources.sha256"
