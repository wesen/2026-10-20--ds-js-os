#!/usr/bin/env bash
# Starting from the measured firmware's isolated build, remove only its probes.
set -euo pipefail
out=$(realpath "$1")
copy=$(realpath -m "$2")
tree=$out/tree
main=$tree/picocalc-os/port/esp32p4/main
exec 9>"$out/build.lock"
flock -x 9
mkdir -p "$copy/partition_table"
cp "$out/build/picocalc-os-p4.bin" "$copy/"
cp "$out/build/partition_table/partition-table.bin" "$copy/partition_table/"
for name in bus_p4.c main_p4.c; do
    test -f "$main/$name.before-observer"
    cp "$main/$name.before-observer" "$main/$name"
done
if rg -n 'panel_observer_console|panel_memory_keys' "$main/bus_p4.c" "$main/main_p4.c"; then exit 1; fi
set +u
source /home/manuel/esp/esp-idf-5.4.2/export.sh
set -u
idf.py -C "$main/.." -B "$out/build" build
sha256sum "$copy/picocalc-os-p4.bin" "$out/build/picocalc-os-p4.bin"
