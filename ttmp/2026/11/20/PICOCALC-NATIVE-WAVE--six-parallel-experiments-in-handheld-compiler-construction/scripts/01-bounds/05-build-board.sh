#!/usr/bin/env bash
# Usage: 04-build-board.sh WARM_ORDINARY_BUILD DIRECTORY_FOR_RESULT EXPORTED_POSITIVE_IMAGES
set -eo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
work=$(realpath "$1")
result=$(realpath -m "$2")
tree=$work/tree
[[ "$tree" != "$repo" && "$tree" != "$repo/"* ]]
exec 9>"$work/build.lock"
flock -x 9
git -C "$repo" ls-files -co --exclude-standard -z -- cji picocalc-os |
    rsync -rcpl --from0 --files-from=- "$repo/" "$tree/"
port=$tree/picocalc-os/port/esp32p4
node "$here/04-build-stage.mjs" "$tree" "$3"
source /home/manuel/esp/esp-idf-5.4.2/export.sh
idf.py -C "$port" -B "$work/build" -D "SDKCONFIG=$work/sdkconfig"     -D PICOCALC_HEADLESS=OFF -D PICOCALC_DEVICE_COMPILER=ON     -D PICOCALC_RV32_CHESS=ON -D PICOCALC_RV32_AGENDA=ON     -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_FILES=ON     -D PICOCALC_RV32_STREAM_FUNCTIONS=ON -D PICOCALC_AGENT_WIFI=OFF     -D PICOCALC_MOBILE_PAINTER=ON -D PICOCALC_CHESS_3D=ON build
mkdir -p "$result/build/partition_table"
cp "$work/build/picocalc-os-p4.bin" "$result/build/"
cp "$work/build/partition_table/partition-table.bin" "$result/build/partition_table/"
sha256sum "$result/build/picocalc-os-p4.bin"
