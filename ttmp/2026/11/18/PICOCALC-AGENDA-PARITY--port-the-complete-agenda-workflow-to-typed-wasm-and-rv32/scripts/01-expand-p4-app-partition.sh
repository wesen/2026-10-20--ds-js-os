#!/usr/bin/env bash
# Use from the repository root after activating ESP-IDF 5.4.2.
# This procedure resets the relocated files and world records, with a raw local backup.
set -euo pipefail
umask 077

if [[ $# -ne 3 || -z ${IDF_PATH:-} ]]; then
    echo "usage: $0 SERIAL PANEL_BUILD_DIR NEW_BACKUP_DIR" >&2
    exit 2
fi

port=$1
build=$2
out=$3
table="$build/partition_table/partition-table.bin"
app="$build/picocalc-os-p4.bin"
decode=(python "$IDF_PATH/components/partition_table/gen_esp32part.py")
rom=(python "$IDF_PATH/components/esptool_py/esptool/esptool.py" --chip esp32p4 --port "$port" --baud 921600)
console=(python3 picocalc-os/tools/p4cap.py -p "$port")

mkdir -- "$out"
cp -- "$table" "$out/new-table.bin"
cp -- "$app" "$out/new-app.bin"
"${decode[@]}" "$out/new-table.bin" >"$out/new-table.csv"
grep -Fxq 'factory,app,factory,0x10000,8M,' "$out/new-table.csv"
grep -Fxq 'agentstore,data,nvs,0x810000,128K,' "$out/new-table.csv"
grep -Fxq 'files,data,fat,0x830000,8000K,' "$out/new-table.csv"
(( $(stat -c %s "$out/new-app.bin") <= 0x800000 ))

"${console[@]}" --no-reset -s 1 -c '0.1 hold' >"$out/hold.log"
"${rom[@]}" --after no_reset flash_id >"$out/flash-id.log"
grep -q 'Detected flash size: 32MB' "$out/flash-id.log"
"${rom[@]}" --after no_reset read_flash 0x8000 0x1000 "$out/old-table.bin" >"$out/read-table.log"
"${decode[@]}" "$out/old-table.bin" >"$out/old-table.csv"
grep -Fxq 'factory,app,factory,0x10000,4M,' "$out/old-table.csv"
grep -Fxq 'agentstore,data,nvs,0x410000,128K,' "$out/old-table.csv"
grep -Fxq 'files,data,fat,0x430000,12096K,' "$out/old-table.csv"
# The app and all its old data partitions occupy this contiguous range.
# Credentials and PHY data lie outside it and are unchanged by this operation.
"${rom[@]}" --after no_reset read_flash 0x10000 0xff0000 "$out/old-app-and-data.bin" >"$out/backup.log"
(( $(stat -c %s "$out/old-app-and-data.bin") == 0xff0000 ))
(cd "$out" && sha256sum old-table.bin old-app-and-data.bin new-table.bin new-app.bin >SHA256SUMS)

"${rom[@]}" --after no_reset erase_region 0x810000 0x7f0000 >"$out/erase-relocated-data.log"
"${rom[@]}" write_flash 0x8000 "$out/new-table.bin" 0x10000 "$out/new-app.bin" >"$out/flash.log"
(( $(grep -c 'Hash of data verified' "$out/flash.log") == 2 ))
"${console[@]}" --no-reset -s 14 -c '10 cji status' >"$out/boot.log"
grep -aq '#OK cji' "$out/boot.log"

# To roll back, verify SHA256SUMS, hold the keyboard bus and use the same ROM tool:
#   write_flash 0x8000 "$out/old-table.bin" 0x10000 "$out/old-app-and-data.bin"
