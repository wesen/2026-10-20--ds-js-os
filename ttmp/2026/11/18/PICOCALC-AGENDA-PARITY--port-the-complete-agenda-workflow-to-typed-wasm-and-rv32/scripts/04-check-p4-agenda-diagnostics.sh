#!/usr/bin/env bash
# After the 8 MiB migration, verify typed Agenda prompt errors on the powered PicoCalc.
set -euo pipefail
if [[ $# -ne 3 || -z ${IDF_PATH:-} ]]; then
    echo "usage: $0 SERIAL PANEL_BUILD_DIR NEW_OUTPUT_DIRECTORY" >&2
    exit 2
fi
port=$1
build=$2
out=$3
mkdir -- "$out"
cap=(python3 picocalc-os/tools/p4cap.py -p "$port")
rom=(python "$IDF_PATH/components/esptool_py/esptool/esptool.py" --chip esp32p4 --port "$port" --baud 921600)

"${cap[@]}" --no-reset -s 1 -c '0.2 hold' >"$out/hold.log"
"${rom[@]}" write_flash 0x10000 "$build/picocalc-os-p4.bin" >"$out/flash.log"
grep -q 'Hash of data verified' "$out/flash.log"
"${cap[@]}" -s 10 -c '8 cji status' >"$out/boot.log"
grep -aq 'factory.*00010000 00800000' "$out/boot.log"
grep -aq 'agenda response us=' "$out/boot.log"
grep -aq '#OK cji' "$out/boot.log"

cap+=(--no-reset)
"${cap[@]}" -s 2 -c '0.2 cat notes/todo.txt' >"$out/before.log"
before=$(tr -d '\r' <"$out/before.log")
[[ "$before" == '#OK cat' || "$before" == $'no file notes/todo.txt\n#OK cat' ]]
"${cap[@]}" -s 22 --shot-dir "$out" \
    -c '0.5 key f1' -c '1.3 key t' -c '2.5 key f2' \
    -c '3.2 type x @2026-11-31' -c '5.4 key enter' -c '6.5 shot' \
    -c '10 key esc' -c '10.7 key f2' -c '11.2 type x @2026-11-02 25:30' \
    -c '14.2 key enter' -c '15.1 shot' -c '19.0 key esc' -c '20 stats' \
    >"$out/diagnostics.log" 2>"$out/shot.log"
[[ $(grep -c 'crc ok' "$out/shot.log") == 2 ]]
"${cap[@]}" -s 2 -c '0.2 cat notes/todo.txt' >"$out/after.log"
[[ $(tr -d '\r' <"$out/after.log") == "$before" ]]
