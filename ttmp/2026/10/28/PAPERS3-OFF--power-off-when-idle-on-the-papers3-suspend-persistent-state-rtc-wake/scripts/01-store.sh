#!/bin/sh
# P1: the persistent store on the host. Runs 01-store.txt against the test manifest js-papers3/test/store.json
# (the world "keep", store_kb 1) and compares the kernel log, without its timestamps, with 01-store.expected.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OS=$(cd "$HERE/../../../../../../picocalc-os" && pwd)
OUT=${TMPDIR:-/tmp}/papers3-off-store
cd "$OS"
make BOARD=papers3 >/dev/null
./build-papers3/papers3-host -j js-papers3 -m js-papers3/test/store.json -o "$OUT" "$HERE/01-store.txt" >/dev/null
grep -v '^#OCT1' "$OUT/uart.log" | sed 's/^\[ *[0-9.]*\( ms\)\?\] //' | diff "$HERE/01-store.expected" - && echo "store: as expected"
