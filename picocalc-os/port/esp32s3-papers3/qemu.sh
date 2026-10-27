#!/bin/sh
# Run the firmware in Espressif's QEMU (machine esp32s3) and drive its console: build the S3_QEMU variant
# (sdkconfig.qemu), merge a 16 MB flash image, boot it with UART0 bridged to a pty, and run tools/s3cap.py on it.
#
#   ./qemu.sh [SECONDS] [-c "AT_SECONDS COMMAND"]...      e.g. ./qemu.sh 36 -c "28 stats" -c "30 heap"
#
# Needs ESP-IDF 5.3 in the environment (. ~/esp/esp-idf-5.3.4/export.sh), Espressif's qemu-system-xtensa
# (idf_tools.py install qemu-xtensa) and socat. The QEMU build has no panel, I2C, ADC or PSRAM, so it boots the
# engine's conformance worlds (js-papers3/test/qemu.json), not the system.
set -e
cd "$(dirname "$0")"
SECS=${1:-40}; [ $# -gt 0 ] && shift
mkdir -p build-qemu
# sdkconfig.qemu only fills in values the build's sdkconfig lacks, so a change to either defaults file starts it afresh
for f in sdkconfig.defaults sdkconfig.qemu; do [ build-qemu/sdkconfig -nt $f ] || rm -f build-qemu/sdkconfig; done
idf.py -B build-qemu -DS3_QEMU=1 -DSDKCONFIG=build-qemu/sdkconfig -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.qemu" build \
  >build-qemu/idf-build.log 2>&1 || { tail -30 build-qemu/idf-build.log; exit 1; }
(cd build-qemu && esptool.py --chip esp32s3 merge_bin --fill-flash-size 16MB -o flash-qemu.bin @flash_args >/dev/null)
Q=$(command -v qemu-system-xtensa || ls ~/.espressif/tools/qemu-xtensa/*/qemu/bin/qemu-system-xtensa | tail -1)
# QEMU waits on a Unix socket (its path must be short, hence a fresh /tmp dir) until socat connects, and s3cap
# holds socat's pty from before the boot, so no output is lost
T=$(mktemp -d /tmp/s3qemu.XXXXXX)
"$Q" -nographic -machine esp32s3 -drive file=build-qemu/flash-qemu.bin,if=mtd,format=raw \
  -chardev socket,id=s0,path=$T/s,server=on,wait=on -serial chardev:s0 -monitor none >$T/qemu.log 2>&1 & QPID=$!
sleep 1
socat PTY,link=$T/tty,raw,echo=0 UNIX-CONNECT:$T/s & SPID=$!
sleep 1
python3 ../../tools/s3cap.py -p $T/tty --no-reset -s "$SECS" "$@" || true
kill $QPID $SPID 2>/dev/null || true
rm -rf $T
