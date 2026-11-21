#!/usr/bin/env bash
set -eo pipefail
work=$(realpath "$1")
source /home/manuel/esp/esp-idf-5.4.2/export.sh
idf.py -C "$work" -B "$work/build" -DIDF_TARGET=esp32p4 build
