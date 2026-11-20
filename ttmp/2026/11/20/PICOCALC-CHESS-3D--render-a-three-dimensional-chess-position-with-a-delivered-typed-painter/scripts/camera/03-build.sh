#!/usr/bin/env bash
# Usage: 03-build.sh PRIVATE_BUILD_ROOT DEPENDENCY_LOCK ordinary|observe [ARTIFACT_DIR]
set -eo pipefail
out=$(realpath -m "$1")
lock=$(realpath "$2")
profile=$3
[[ "$profile" == ordinary || "$profile" == observe ]]
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
tree=$out/tree
[[ "$tree" != "$repo" && "$tree" != "$repo/"* ]]
mkdir -p "$tree"
exec 9>"$out/build.lock"
flock -x 9
git -C "$repo" ls-files -co --exclude-standard -z -- cji picocalc-os |
    rsync -rcpl --from0 --files-from=- "$repo/" "$tree/"
port=$tree/picocalc-os/port/esp32p4
original=$repo/picocalc-os/port/esp32p4
cp -an "$original/managed_components" "$port/"
cp "$original/sdkconfig.agent-elf" "$out/sdkconfig"
cp "$lock" "$port/dependencies.elf.lock"
if [[ "$profile" == observe ]]; then
    python3 -B "$here"/../../../PICOCALC-MOBILE-PAINTER--*/scripts/device/stage-observer.py "$tree"
    if [[ -f "$here/06-animation-observer.py" ]]; then
        python3 -B "$here/06-animation-observer.py" "$tree"
    fi
    python3 -B "$here/06-animation-observer.py" "$tree"
fi
source /home/manuel/esp/esp-idf-5.4.2/export.sh
idf.py -C "$port" -B "$out/build" -D "SDKCONFIG=$out/sdkconfig" \
    -D PICOCALC_HEADLESS=OFF -D PICOCALC_DEVICE_COMPILER=ON \
    -D PICOCALC_RV32_CHESS=ON -D PICOCALC_RV32_AGENDA=ON \
    -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_RV32_STREAM_FUNCTIONS=ON -D PICOCALC_AGENT_WIFI=OFF \
    -D PICOCALC_MOBILE_PAINTER=ON -D PICOCALC_CHESS_3D=ON build
node "$here/07-qualify-build.mjs" "$out" "$out/camera-qualify.json"
if [[ -n "${4:-}" ]]; then
    artifact=$(realpath -m "$4")
    mkdir -p "$artifact/build/partition_table"
    cp "$out/build/picocalc-os-p4.bin" "$artifact/build/"
    cp "$out/build/partition_table/partition-table.bin" "$artifact/build/partition_table/"
    cp "$out/camera-qualify.json" "$artifact/qualify.json"
    cp "$tree/picocalc-os/worlds/chess/painter-3d.typed" "$artifact/painter.typed"
    python3 -B "$here"/../../../PICOCALC-MOBILE-PAINTER--*/scripts/device/build-receipt.py "$out" "$artifact/build.json"
fi
sha256sum "$out/build/picocalc-os-p4.bin"
