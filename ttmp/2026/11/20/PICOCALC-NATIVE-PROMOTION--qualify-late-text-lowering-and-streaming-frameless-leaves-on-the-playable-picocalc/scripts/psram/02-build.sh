#!/usr/bin/env bash
set -eo pipefail
if (( $# != 4 )); then echo 'usage: 02-build.sh OFFICIAL_STAGE OLD_RELEASE_BIN NEW_PROBE_DIR IDF_EXPORT' >&2; exit 2; fi
here=$(cd "$(dirname "$0")" && pwd)
root=$(git rev-parse --show-toplevel)
stage=$(realpath "$1")
probe=$(realpath -m "$3")
mkdir -- "$probe"
cp "$here/CMakeLists.txt" "$probe/"
cp -R "$here/main" "$probe/"
port="$stage/tree/picocalc-os/port/esp32p4"
cp -R "$port/managed_components" "$probe/"
cp "$port/dependencies.elf.lock" "$probe/dependencies.lock"
cp "$port/optional/native_elf/idf_component.yml" "$probe/main/idf_component.yml"
cp "$port/partitions.csv" "$probe/"
cp "$stage/build/sdkconfig.smooth-chess" "$probe/sdkconfig"
node "$here/01-export.mjs" "$2" "$(cat "$stage/revision")" "$probe/main"
release=("$root"/ttmp/2026/11/20/PICOCALC-RELEASE-LAB--*)
node "${release[0]}/scripts/chess/prepare.mjs" "$probe/oracle" 1 > "$probe/oracle.log"
cp "$probe/oracle/bench-data.h" "$probe/main/"
source "$4"
idf.py -C "$probe" -B "$probe/build" -DIDF_TARGET=esp32p4 build
