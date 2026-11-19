#!/usr/bin/env bash
# Use after the partition migration. The build must use the 8 MiB, panel-enabled RV32 profile.
set -euo pipefail

if [[ $# -ne 3 || -z ${IDF_PATH:-} ]]; then
    echo "usage: $0 SERIAL PANEL_BUILD_DIR NEW_OUTPUT_DIRECTORY" >&2
    exit 2
fi

port=$1
build=$2
out=$3
mkdir -- "$out"
cap=(python3 picocalc-os/tools/p4cap.py -p "$port")
rom=(python "$IDF_PATH/components/esptool_py/esptool/esptool.py" --chip esp32p4 --port "$port" --baud 921600)
"${cap[@]}" --no-reset -s 1 -c '0.2 hold' >"$out/hold.log"
"${rom[@]}" write_flash 0x10000 "$build/picocalc-os-p4.bin" >"$out/flash.log"
grep -q 'Hash of data verified' "$out/flash.log"
"${cap[@]}" -s 11 -c '8 df' -c '9 cji status' >"$out/boot.log"
grep -aq 'factory.*00010000 00800000' "$out/boot.log"
grep -aq 'agenda response us=' "$out/boot.log"
grep -aq '#OK cji' "$out/boot.log"
cap+=(--no-reset)
"${cap[@]}" -s 2 -c '0.2 cat notes/todo.txt' >"$out/before.log"
grep -aq '^no file notes/todo.txt' "$out/before.log"
fixture=$(printf '# Agenda smoke\n  - write\n- remove\n' | base64 -w0)

cleanup() {
    "${cap[@]}" -s 2 -c '0.2 put notes/todo.txt' >"$out/cleanup.log"
    grep -aq '^put notes/todo.txt: 0 bytes' "$out/cleanup.log"
}
trap cleanup EXIT

"${cap[@]}" -s 16 --shot-dir "$out" \
    -c '0.2 put notes/todo.txt' -c "0.5 put notes/todo.txt $fixture" \
    -c '1.2 key t' -c '2.8 key down' -c '3.3 key space' \
    -c '4.1 cat notes/todo.txt' \
    -c '4.6 key f4' -c '5.1 key down' -c '5.6 key f3' \
    -c '6.1 key space' -c '6.5 type changed' -c '7.8 key enter' \
    -c '8.6 cat notes/todo.txt' \
    -c '9.1 key up' -c '9.6 key f5' -c '10.2 cat notes/todo.txt' \
    -c '10.7 key f5' -c '11.6 cat notes/todo.txt' -c '12.2 shot' \
    -c '15 stats' >"$out/mutations.log" 2>"$out/shot.log"

python3 - "$out/mutations.log" <<'PY'
import re
import sys
from pathlib import Path

log = Path(sys.argv[1]).read_text(errors="replace")
notes = re.findall(r"(?m)^# Agenda smoke\n(.*?)^#OK cat\s*$", log, re.DOTALL)
assert notes == [
    "  - [x] write\n- remove\n",
    "  - [x] write changed\n- remove\n",
    "  - [x] write changed\n- remove\n",
    "  - [x] write changed\n",
], repr(notes)
PY
grep -q 'crc ok' "$out/shot.log"
