#!/usr/bin/env bash
# Run from the repository root with the ESP-IDF environment active.
set -euo pipefail

if [[ $# -lt 5 || -z ${IDF_PATH:-} ]]; then
  echo "usage: $0 SERIAL TEST_APP RESTORE_APP SAVED_PARTITION OUTPUT_DIR [P4CAP_OPTIONS...]" >&2
  exit 2
fi

port=$1
test_image=$2
restore_image=$3
saved_partition=$4
out=$5
shift 5
cap=(python3 picocalc-os/tools/p4cap.py -p "$port")
flasher=(python "$IDF_PATH/components/esptool_py/esptool/esptool.py"
         --chip esp32p4 --port "$port" --baud 921600 write_flash 0x10000)

[[ -s "$test_image" && -s "$restore_image" ]]
cmp -n "$(stat -c %s "$restore_image")" "$restore_image" "$saved_partition"
mkdir -p "$out"

restore() {
  "${cap[@]}" --no-reset -s 1 -c '0.1 hold' >"$out/restore-hold.log" || true
  "${flasher[@]}" "$restore_image" >"$out/restore-flash.log"
  "${cap[@]}" --no-reset -s 9 -c '7 cji status' >"$out/restored-probe.log"
  rg -q 'Hash of data verified' "$out/restore-flash.log"
  rg -a -q '#OK cji' "$out/restored-probe.log"
}

"${cap[@]}" --no-reset -s 1 -c '0.1 hold' >"$out/test-hold.log"
trap restore EXIT
"${flasher[@]}" "$test_image" >"$out/test-flash.log"
"${cap[@]}" -s 9 "$@" >"$out/panel-boot.log"
