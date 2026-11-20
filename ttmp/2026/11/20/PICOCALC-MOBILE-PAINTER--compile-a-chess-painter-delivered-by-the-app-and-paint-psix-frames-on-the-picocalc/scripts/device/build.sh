#!/usr/bin/env bash
# Isolate IDF's generated artifacts and application source from other targets.
set -euo pipefail
out=$(realpath -m "$1")
arm=$2     # control | mobile
profile=$3 # normal | observe
repo=$(git rev-parse --show-toplevel)
here=$(cd "$(dirname "$0")" && pwd)
[[ "$arm" = control || "$arm" = mobile ]]
[[ "$profile" = normal || "$profile" = observe ]]
tree=$out/tree
mkdir -p "$tree"
exec 9>"$out/build.lock"
flock -x 9
base=8715aaf60eef2ef34f2b351e03d83fd69bec1e48
if [[ "$arm" = mobile ]]; then
    # Include all implementation changes in the private staging tree. Exclude
    # generated artifacts according to the repository's per-directory ignore rules.
    (cd "$repo" && git ls-files -co --exclude-standard -z -- cji picocalc-os) |
      rsync -rcpl --from0 --files-from=- "$repo/" "$tree/"
    # Copy by content and stamp changes at staging time. Otherwise a file edited
    # during a prior build can be older than the object built from its old copy.
else
    git -C "$repo" archive "$base" cji picocalc-os | tar -xf - -C "$tree"
fi
port=$tree/picocalc-os/port/esp32p4
original=$repo/picocalc-os/port/esp32p4
cp -an "$original/managed_components" "$port/"
cp "$original/sdkconfig.agent-elf" "$out/sdkconfig"
cp /tmp/pico-snake-production/tree/picocalc-os/port/esp32p4/dependencies.elf.lock "$port/dependencies.elf.lock"
if [[ "$profile" = observe ]]; then
    python3 -B "$here/stage-observer.py" "$tree"
fi
set +u
source /home/manuel/esp/esp-idf-5.4.2/export.sh
set -u
args=()
if [[ "$arm" = mobile ]]; then args+=(-D PICOCALC_MOBILE_PAINTER=ON); fi
idf.py -C "$port" -B "$out/build" -D "SDKCONFIG=$out/sdkconfig" \
    -D PICOCALC_HEADLESS=OFF -D PICOCALC_DEVICE_COMPILER=ON \
    -D PICOCALC_RV32_CHESS=ON -D PICOCALC_RV32_AGENDA=ON \
    -D PICOCALC_RV32_EDITOR=ON -D PICOCALC_RV32_FILES=ON \
    -D PICOCALC_RV32_STREAM_FUNCTIONS=ON -D PICOCALC_AGENT_WIFI=OFF "${args[@]}" build
sha256sum "$out/build/picocalc-os-p4.bin"
