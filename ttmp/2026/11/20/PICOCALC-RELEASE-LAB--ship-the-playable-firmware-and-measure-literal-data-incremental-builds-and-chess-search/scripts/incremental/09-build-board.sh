#!/usr/bin/env bash
set -eo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(realpath "$1")
out=$(realpath -m "$2")
node "$here/08-gold.mjs" "$work"
python3 -B "$here/07-board-stage.py" "$work" "$out"
source /home/manuel/esp/esp-idf-5.4.2/export.sh >/dev/null
idf.py -C "$out" -B "$out/build" -DIDF_TARGET=esp32p4 build
