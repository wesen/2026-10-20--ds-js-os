#!/usr/bin/env bash
set -eo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
work=$(realpath -m "$1")
mkdir -p "$work"
cp -r "$here/board/." "$work/"
cp "$repo/picocalc-os/port/esp32p4/partitions.csv" "$work/"
node "$here/prepare.mjs" "$work/main"
source /home/manuel/esp/esp-idf-5.4.2/export.sh
idf.py -C "$work" -B "$work/build" -DIDF_TARGET=esp32p4 build
sha256sum "$work/build/typed_chess_benchmark.bin" "$work/build/partition_table/partition-table.bin"
