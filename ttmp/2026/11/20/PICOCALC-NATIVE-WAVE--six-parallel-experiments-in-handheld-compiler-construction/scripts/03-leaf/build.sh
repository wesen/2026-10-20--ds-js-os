#!/usr/bin/env bash
set -eo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(realpath -m "$1")
reference=$(realpath "$2")
python3 -B "$here/prepare-board.py" "$work" "$reference"
source /home/manuel/esp/esp-idf-5.4.2/export.sh
idf.py -C "$work" -B "$work/build" -DIDF_TARGET=esp32p4 build
sha256sum "$work/build/typed_chess_benchmark.bin" "$work/build/partition_table/partition-table.bin"
