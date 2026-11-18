#!/usr/bin/env bash
# Run from the repository root with exclusive access to the idle serial console.
# Arguments: output directory, profile-build directory, esptool executable, WORLD:MIB ...
set -euo pipefail
out=$(realpath -m "$1")
build=$(realpath "$2")
esptool=$3
shift 3
[[ $# -gt 0 ]]
grep -qx 'PICOCALC_COMPILER_PROFILE:BOOL=ON' "$build/CMakeCache.txt"
mkdir -p "$out"
session=$(mktemp -d "$out/boot-XXXXXX")
scripts=$(dirname "$0")
monitor=(ttmp/2026/11/17/*CJI-PORT--*/scripts/2026-11-18-session/cji-flash-monitor.py)
port=/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00
cp "$build/picocalc-os-p4."{elf,bin} "$session/"
sha256sum "$session"/picocalc-os-p4.* > "$session/firmware.sha256"
cap=(python3 picocalc-os/tools/p4cap.py -p "$port")
"${cap[@]}" --no-reset -s 4 -c '0.5 cji status' -c '2 hold' > "$session/before.log"
grep -aq 'cji: idle' "$session/before.log"
grep -aq 'held between transactions' "$session/before.log"
restore() {
    "${cap[@]}" -s 16 -c '10 worlds' -c '13 stats' > "$session/restored.log"
}
trap restore EXIT
python3 "${monitor[0]}" "$esptool" --chip esp32p4 --port "$port" --baud 921600 --connect-attempts 1 write_flash --flash_mode dio --flash_freq 80m --flash_size 32MB 0x10000 "$session/picocalc-os-p4.bin" > "$session/flash.log" 2>&1
"${cap[@]}" --no-reset -s 18 -c '13 hold' -c '16 cji status' > "$session/ready.log"
grep -aq 'held between transactions' "$session/ready.log"
grep -aq 'cji: idle' "$session/ready.log"
python3 "$scripts/05-board-runs.py" "$out" --firmware-elf "$session/picocalc-os-p4.elf" --board-condition "Keyboard I2C held between transactions, worker on core 0" "$@"
