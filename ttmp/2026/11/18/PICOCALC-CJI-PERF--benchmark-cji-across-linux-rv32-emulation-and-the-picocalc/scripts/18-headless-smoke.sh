#!/usr/bin/env bash
# From the repository root, with the built profiling image and exclusive serial access.
set -euo pipefail
out=${1:?supply a directory for UART captures}
build=${2:-picocalc-os/port/esp32p4/build-elf}
port=/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00
mkdir -p "$out"
grep -qx 'PICOCALC_HEADLESS:BOOL=ON' "$build/CMakeCache.txt"
jq -e '[.worlds[].name] | (index("keyboard") == null and index("display") == null and index("power") == null and index("compositor") == null and index("agenda") != null)' "$build/esp-idf/main/system.cji.json"
cap=(python3 picocalc-os/tools/p4cap.py -p "$port")
"${cap[@]}" --no-reset -s 4 -c '0.5 cji status' -c '2 hold' > "$out/before.log"
grep -aq 'cji: idle' "$out/before.log"
grep -aq 'held between transactions' "$out/before.log"
monitor=(ttmp/2026/11/17/*CJI-PORT--*/scripts/2026-11-18-session/cji-flash-monitor.py)
python3 "${monitor[0]}" "$HOME/.espressif/python_env/idf5.4_py3.13_env/bin/esptool.py" --chip esp32p4 --port "$port" --baud 921600 --connect-attempts 1 write_flash --flash_mode dio --flash_freq 80m --flash_size 32MB 0x10000 "$build/picocalc-os-p4.bin" > "$out/flash.log" 2>&1
"${cap[@]}" -s 22 -c '12 worlds' -c '16 stats' -c '19 cji status' > "$out/boot.log"
grep -a 'headless: keyboard/power I2C and display SPI offline' "$out/boot.log"
grep -a 'cji: idle' "$out/boot.log"
for bus in i2c0 spi2; do
    grep -aE "bus +$bus +busy +0.00 ms, 0 transfers, 0 bytes, 0 errors" "$out/boot.log"
done
sha256sum "$build/picocalc-os-p4.bin"
scripts=$(dirname "$0")
python3 "$scripts/05-board-runs.py" "$out" --firmware-elf "$build/picocalc-os-p4.elf" \
    --board-condition "Headless P4; keyboard, power, display and compositor omitted" flaky:8
