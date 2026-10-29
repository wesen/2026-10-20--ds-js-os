#!/bin/sh
# P4: standby on the full system (js-papers3/system.json). Runs 04-standby.txt, writes its captures to
# 04-captures/, and compares the runner's power events and standby's log lines, without timestamps, with
# 04-standby.expected.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OS=$(cd "$HERE/../../../../../../picocalc-os" && pwd)
OUT=${TMPDIR:-/tmp}/papers3-off-standby
cd "$OS"
make BOARD=papers3 >/dev/null
./build-papers3/papers3-host -j js-papers3 -o "$OUT" "$HERE/04-standby.txt" > "$OUT.stdout"
cp "$OUT"/4?-*.png "$HERE/04-captures/"
{ grep -E "the board|RTC|^\[.*\] [a-z]" "$OUT.stdout" | grep -v captured; echo "--- uart"; grep -E "standby:|switching|stayed on|booting" "$OUT/uart.log"; } \
  | sed 's/^\[ *[0-9.]*\( ms\)\?\] //' | diff "$HERE/04-standby.expected" - && echo "standby: as expected"
