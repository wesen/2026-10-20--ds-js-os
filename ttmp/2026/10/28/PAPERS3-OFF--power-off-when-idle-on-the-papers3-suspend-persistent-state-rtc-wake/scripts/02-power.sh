#!/bin/sh
# P2: the power-off operation and the simulated power cycle. Runs 02-power.txt against the test manifest js-papers3/test/power.json
# (worlds "off", with sys.power, and "keep") and compares the runner's output and the kernel log, without timestamps, with 02-power.expected.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OS=$(cd "$HERE/../../../../../../picocalc-os" && pwd)
OUT=${TMPDIR:-/tmp}/papers3-off-power
cd "$OS"
make BOARD=papers3 >/dev/null
./build-papers3/papers3-host -j js-papers3 -m js-papers3/test/power.json -o "$OUT" "$HERE/02-power.txt" > "$OUT.stdout"
{ cat "$OUT.stdout"; echo "--- uart"; grep -v '^#OCT1' "$OUT/uart.log"; } | sed 's/^\[ *[0-9.]*\( ms\)\?\] //' | diff "$HERE/02-power.expected" - && echo "power: as expected"
