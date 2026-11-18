#!/bin/bash
set -eu
cd /home/manuel/code/wesen/2026-10-20--ds-js-os
runner=(ttmp/2026/11/17/PICOCALC-CJI-PORT--*/scripts/07-check-bundled-catalog.py)
python3 -u - <<'PY' >/tmp/cji-agenda-recovery.log
import serial,time
with serial.Serial('/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00',115200,timeout=.2) as p:
 end=time.monotonic()+1200
 while time.monotonic()<end:
  p.write(b'\ncji\n')
  until=time.monotonic()+10
  while time.monotonic()<until:
   s=p.readline().decode(errors='replace').strip()
   if s.startswith("cji:") or s.startswith("cji build PATH"):print(s)
   if s.startswith(("cji: check ", "cji build PATH")):raise SystemExit(0)
 raise SystemExit("no idle or terminal receipt")
PY
names=(settings logs loader sysmon repl sandbox snake faults flaky keys about)
if ! grep -q '^cji: check ' /tmp/cji-agenda-recovery.log; then names=(agenda "${names[@]}"); fi
python3 "${runner[0]}" "${names[@]}" > /tmp/cji-catalog-resumed.jsonl 2>/tmp/cji-catalog-resumed-progress.log
python3 "${runner[0]}" compositor launcher files editor > /tmp/cji-catalog-replay.jsonl 2>/tmp/cji-catalog-replay-progress.log
echo complete > /tmp/cji-catalog-resume-done
