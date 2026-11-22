#!/bin/sh
# Flash the PaperS3 over its USB Serial/JTAG without idf.py's reset sequence, which drops the board off USB on
# this host (EIO on the DTR ioctl, then a disconnect). As the esp32-s3-m5 projects' flash_device_usb_jtag.sh does:
# esptool's usb_reset gets it into the ROM downloader, nothing toggles afterwards (--after no_reset), and a second
# esptool call boots the app with a watchdog reset. Build first (idf.py build).
#
#   ./flash.sh [PORT]
set -e
cd "$(dirname "$0")"
PORT=${1:-$(ls /dev/serial/by-id/*Espressif*USB_JTAG* 2>/dev/null | head -1)}
[ -n "$PORT" ] || { echo "no Espressif USB Serial/JTAG port: is cdc_acm loaded, and is the PaperS3 on?" >&2; exit 1; }
cd build
esptool.py --chip esp32s3 -p "$PORT" -b 460800 --before usb_reset --after no_reset write_flash @flash_args
for i in $(seq 50); do [ -e "$PORT" ] && break; sleep 0.2; done   # the port may re-enumerate after the downloader
esptool.py --chip esp32s3 -p "$PORT" --before no_reset --after watchdog_reset read_mac >/dev/null
echo "flashed and booted the app ($PORT)"
