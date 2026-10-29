#!/bin/sh
# P3: RTC wake (off and running, on USB). Runs 03-rtc.txt against the test manifest js-papers3/test/power.json
# (clock, "off" with sys.power, "keep") and compares the runner's output and the kernel log, without timestamps, with 03-rtc.expected.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OS=$(cd "$HERE/../../../../../../picocalc-os" && pwd)
OUT=${TMPDIR:-/tmp}/papers3-off-rtc
cd "$OS"
make BOARD=papers3 >/dev/null
./build-papers3/papers3-host -j js-papers3 -m js-papers3/test/power.json -o "$OUT" "$HERE/03-rtc.txt" > "$OUT.stdout"
{ cat "$OUT.stdout"; echo "--- uart"; grep -v '^#OCT1' "$OUT/uart.log"; } | sed 's/^\[ *[0-9.]*\( ms\)\?\] //' | diff "$HERE/03-rtc.expected" - && echo "rtc: as expected"
