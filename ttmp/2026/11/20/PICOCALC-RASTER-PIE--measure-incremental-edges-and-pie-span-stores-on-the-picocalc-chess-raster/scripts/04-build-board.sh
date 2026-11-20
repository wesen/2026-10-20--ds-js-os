#!/usr/bin/env bash
set -eo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
out=$(realpath -m "$1")
poses=$(realpath "$2")
mkdir -p "$out"
cp -r "$here/board/." "$out/"
cp "$repo/picocalc-os/port/esp32p4/partitions.csv" "$out/"
python3 -B "$here/01-stage.py" "$out"
python3 -B "$here/03-fixtures.py" "$poses" "$out/main"
nucleus="$repo/picocalc-os/nucleus"
staged="$out/picocalc-os/nucleus"
cp "$nucleus"/{nucleus.h,gfx.c,util.c,font_data.h} "$out/main/"
cp "$staged"/{painter_commands.h,mobile_painter.h,raster_edges.c,raster_scalar.c,raster_pie.c} "$out/main/"
cp "$staged/painter_commands.c" "$out/main/stock.c"
cp "$here"/{span.S,common.h} "$out/main/"
cp "$here/damage"/{damage.c,damage.h} "$out/main/"
cp "$here/damage/board.c" "$out/main/damage-benchmark.c"
python3 -B "$here/damage/prepare.py" --board "$out/main/board-cases.inc"
source "$3"
idf.py -C "$out" -B "$out/build" -DIDF_TARGET=esp32p4 build
sha256sum "$out/build/raster_pie_experiment.bin" "$out/build/partition_table/partition-table.bin"
