#!/bin/sh
# P5: resume without a flash (js-papers3/system.json). Runs 05-resume.txt, writes its captures to 05-captures/,
# and compares the panel's counters, the power events and the picture's save and adoption, without timestamps,
# with 05-resume.expected: across the resume the quality (clean) count stays the same and one text update is added.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OS=$(cd "$HERE/../../../../../../picocalc-os" && pwd)
OUT=${TMPDIR:-/tmp}/papers3-off-resume
cd "$OS"
make BOARD=papers3 >/dev/null
./build-papers3/papers3-host -j js-papers3 -o "$OUT" "$HERE/05-resume.txt" > "$OUT.stdout"
cp "$OUT"/5?-*.png "$HERE/05-captures/"
{ grep -E "^panel:|the board" "$OUT.stdout"; echo "--- uart"; grep -E "picture|clean refresh|standby:" "$OUT/uart.log"; } \
  | sed 's/^\[ *[0-9.]*\( ms\)\?\] //' | diff "$HERE/05-resume.expected" - && echo "resume: as expected"
