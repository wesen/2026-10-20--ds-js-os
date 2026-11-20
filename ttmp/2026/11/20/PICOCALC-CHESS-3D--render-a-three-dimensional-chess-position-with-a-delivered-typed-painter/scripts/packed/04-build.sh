#!/usr/bin/env bash
# Build the packed 3D study from an isolated source copy.
set -eo pipefail
out=$(realpath -m "$1")
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
mobile=$(find "$here/../../.." -mindepth 1 -maxdepth 1 -type d -name 'PICOCALC-MOBILE-PAINTER--*')
pie=$(find "$here/../../.." -mindepth 1 -maxdepth 1 -type d -name 'PICOCALC-TYPED-PIE--*')
tree=$out/tree
mkdir -p "$tree"
exec 9>"$out/build.lock"
flock -x 9
(git -C "$repo" ls-files -co --exclude-standard -z -- cji picocalc-os) |
  rsync -rcpl --from0 --files-from=- "$repo/" "$tree/"
port=$tree/picocalc-os/port/esp32p4
original=$repo/picocalc-os/port/esp32p4
cp -an "$original/managed_components" "$port/"
cp "$original/sdkconfig.agent-elf" "$out/sdkconfig"
cp "$2" "$port/dependencies.elf.lock"
python3 -B "$mobile/scripts/device/stage-observer.py" "$tree"
python3 -B "$here/03-stage.py" "$tree" "$3"
sha256sum "$pie/scripts/02-pie-lowering.js" "$pie/scripts/03-compile.mjs" > "$out/pie-inputs.sha256"
source /home/manuel/esp/esp-idf-5.4.2/export.sh
idf.py -C "$port" -B "$out/build" -D "SDKCONFIG=$out/sdkconfig" \
    -D PICOCALC_HEADLESS=OFF -D PICOCALC_DEVICE_COMPILER=ON \
    -D PICOCALC_RV32_CHESS=ON -D PICOCALC_RV32_AGENDA=ON \
    -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_RV32_STREAM_FUNCTIONS=ON -D PICOCALC_AGENT_WIFI=OFF \
    -D PICOCALC_MOBILE_PAINTER=ON build
python3 -B "$mobile/scripts/device/build-receipt.py" "$out" "$out/build.json"
sha256sum "$out/build/picocalc-os-p4.bin"
