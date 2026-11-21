#!/usr/bin/env bash
set -eo pipefail
here=$(cd "$(dirname "$0")" && pwd)
python3 -B "$here/10-board-stage.py" "$1" "$2"
source /home/manuel/esp/esp-idf-5.4.2/export.sh >/dev/null
idf.py -C "$2" -B "$2/build" -DIDF_TARGET=esp32p4 build
