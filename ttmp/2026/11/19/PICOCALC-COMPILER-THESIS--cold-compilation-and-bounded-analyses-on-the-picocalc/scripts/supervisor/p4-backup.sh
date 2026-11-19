#!/usr/bin/env bash
# Read only the partition table and factory app; private and filesystem partitions stay on the board.
set -euo pipefail
port=$1
out=$2
esptool=$3
mkdir -p "$out"
test ! -e "$out/factory-original.bin"
python3 picocalc-os/tools/p4cap.py --no-reset -p "$port" -s 2 -c '0.2 hold' > "$out/pre-backup.log"
grep -q '#OK hold' "$out/pre-backup.log"
"$esptool" --chip esp32p4 -p "$port" -b 921600 --after no_reset read_flash 0x8000 0x1000 "$out/partition-table.bin" > "$out/read-table.log"
python3 - "$out/partition-table.bin" <<'PY'
import struct, sys
data = open(sys.argv[1], 'rb').read()
entry = struct.Struct('<HBBII16sI')
rows = [entry.unpack_from(data,i) for i in range(0,len(data),32)]
assert any((magic,typ,sub,off,size,name.rstrip(b'\0')) == (0x50aa,0,0,0x10000,0x800000,b'factory') for magic,typ,sub,off,size,name,_ in rows), 'unexpected factory partition'
PY
"$esptool" --chip esp32p4 -p "$port" -b 921600 read_flash 0x10000 0x800000 "$out/factory-original.bin" > "$out/read-app.log"
test "$(wc -c < "$out/factory-original.bin")" -eq 8388608
sha256sum "$out/factory-original.bin" "$out/partition-table.bin"
