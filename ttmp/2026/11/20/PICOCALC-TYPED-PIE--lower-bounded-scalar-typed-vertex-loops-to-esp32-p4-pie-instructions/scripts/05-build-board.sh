#!/usr/bin/env bash
# Build the board-only benchmark without opening a serial connection.
set -eo pipefail
scripts=$(cd "$(dirname "$0")" && pwd)
repository=$(git -C "$scripts" rev-parse --show-toplevel)
work=$(realpath -m "$1")
mkdir -p "$work"
cp -r "$scripts/board/." "$work/"
cp "$repository/picocalc-os/port/esp32p4/partitions.csv" "$work/"
for arm in scalar portable pie; do
    name=$arm
    if [[ "$arm" == "scalar" ]]; then name=stock; fi
    node "$scripts/03-compile.mjs" compile "$scripts/01-vertices.typed" "$work/main/$name.bin" "$arm" |
        tee "$work/$name.json"
done
source "$2"
idf.py -C "$work" -B "$work/build" -DIDF_TARGET=esp32p4 build
sha256sum "$work/build/typed_pie_experiment.bin" "$work/build/partition_table/partition-table.bin"
