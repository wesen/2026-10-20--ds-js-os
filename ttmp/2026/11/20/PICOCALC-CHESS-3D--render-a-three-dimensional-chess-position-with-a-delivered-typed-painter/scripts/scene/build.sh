#!/usr/bin/env bash
# Build either the observed trial or the ordinary 3D image in a private tree.
set -eo pipefail
out=$(realpath -m "$1")
profile=${3:-observe}
[[ "$profile" = observe || "$profile" = ordinary ]]
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
python3 -B "$here/stage.py" "$tree"
if [[ "$profile" = observe ]]; then
    python3 -B "$mobile/scripts/device/stage-observer.py" "$tree"
    node "$pie/scripts/03-compile.mjs" stage "$tree/picocalc-os/compiler/typed-rv32.js"
    python3 -B "$here/instrument.py" "$tree"
    sha256sum "$pie/scripts/02-pie-lowering.js" "$pie/scripts/03-compile.mjs" > "$out/pie-inputs.sha256"
fi
source /home/manuel/esp/esp-idf-5.4.2/export.sh
idf.py -C "$port" -B "$out/build" -D "SDKCONFIG=$out/sdkconfig" \
    -D PICOCALC_HEADLESS=OFF -D PICOCALC_DEVICE_COMPILER=ON \
    -D PICOCALC_RV32_CHESS=ON -D PICOCALC_RV32_AGENDA=ON \
    -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_RV32_STREAM_FUNCTIONS=ON -D PICOCALC_AGENT_WIFI=OFF \
    -D PICOCALC_MOBILE_PAINTER=ON build
python3 -B "$mobile/scripts/device/build-receipt.py" "$out" "$out/build.json"
sha256sum "$out/build/picocalc-os-p4.bin"
