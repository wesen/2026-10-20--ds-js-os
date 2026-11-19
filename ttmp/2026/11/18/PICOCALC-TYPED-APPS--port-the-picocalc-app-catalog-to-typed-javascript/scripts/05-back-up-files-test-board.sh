#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 5 ]]; then
    echo "Usage: $0 PORT ESPTOOL_PYTHON ESPTOOL TABLE OUTPUT_DIR" >&2
    exit 2
fi
port=$1
esp_python=$2
esptool=$3
table=$4
out=$5

mkdir "$out"
python picocalc-os/tools/p4cap.py -p "$port" --no-reset -s 1.5 -c '0.2 hold' > "$out/hold.log"
grep -q 'i2c0 held between transactions' "$out/hold.log"
grep -q '#OK hold' "$out/hold.log"
"$esp_python" "$esptool" --chip esp32p4 -p "$port" -b 921600 --after no_reset \
    read_flash 0x8000 0xC00 "$out/partition-table.bin" > "$out/partition.log"
cmp "$table" "$out/partition-table.bin"
"$esp_python" "$esptool" --chip esp32p4 -p "$port" -b 921600 \
    read_flash 0x10000 0x800000 "$out/factory-original.bin" > "$out/app-read.log"
test "$(wc -c < "$out/factory-original.bin")" -eq 8388608
sha256sum "$out/partition-table.bin" "$out/factory-original.bin" > "$out/sources.sha256"
