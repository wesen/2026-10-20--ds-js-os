#!/usr/bin/env bash
# Use after the 8 MiB migration, on a board with an absent or empty notes/todo.txt.
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
fixture=$(printf -- '- editor fixture\n' | base64 -w0)

cleanup() {
    "${cap[@]}" -s 2 -c '0.2 put notes/todo.txt' >"$out/cleanup.log"
    grep -aq '^put notes/todo.txt: 0 bytes' "$out/cleanup.log"
}
trap cleanup EXIT

"${cap[@]}" -s 19 --shot-dir "$out" \
    -c '0.2 put notes/todo.txt' -c "0.5 put notes/todo.txt $fixture" \
    -c '1.0 key f1' -c '1.6 key t' -c '3.2 key f6' \
    -c '4.5 key end' -c '5.0 type X' -c '5.7 key f2' \
    -c '6.8 cat notes/todo.txt' -c '7.5 shot' \
    -c '10.8 key f1' -c '11.5 key t' -c '13.5 shot' -c '18 stats' \
    >"$out/editor.log" 2>"$out/shot.log"
grep -aqx -- $'- editor fixtureX\r' "$out/editor.log"
[[ $(grep -c 'crc ok' "$out/shot.log") == 2 ]]
