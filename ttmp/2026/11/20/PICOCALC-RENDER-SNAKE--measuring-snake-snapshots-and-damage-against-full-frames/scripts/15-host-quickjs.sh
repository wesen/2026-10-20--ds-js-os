#!/usr/bin/env bash
# Same allocator meter as System. Run the application capsule in a new process per arm.
set -euo pipefail
d=$(dirname "$0")
o=${1:?expected output directory}
mkdir -p "$o"
meter=(ttmp/2026/11/20/PICOCALC-RENDER-SYSTEM--*/scripts/14-host-heap.c)
make -C picocalc-os build/eng/quickjs.o build/eng/libregexp.o build/eng/libunicode.o build/eng/cutils.o build/eng/dtoa.o
cc -O2 -I picocalc-os/third_party/quickjs "${meter[0]}" picocalc-os/build/eng/{quickjs,libregexp,libunicode,cutils,dtoa}.o -lm -ldl -lpthread -o "$o/heap"
for trial in {1..5}; do
  for arm in compile J SJ T; do
    "$o/heap" "$d/../various/device-capsule.js" "$arm" > "$o/heap-$trial-$arm.json"
  done
done
python3 - "$o" <<'PY'
import json, pathlib, statistics, sys
o=pathlib.Path(sys.argv[1])
r={}
for arm in ('compile','J','SJ','T'):
    data=[json.loads((o/f'heap-{i}-{arm}.json').read_text()) for i in range(1,6)]
    r[arm]=dict(raw=data)
    if arm!='compile':
        assert all(x['result']['checksum']==463 and x['result']['count']==12 for x in data)
        r[arm]['median']={k:statistics.median(x[k] for x in data) for k in ('resident','peak','highWaterAboveStart')}
        for k in ('producerUs','receiverUs'):
            r[arm]['median'][k]=statistics.median(x['result'][k] for x in data)
(o/'host-quickjs.json').write_text(json.dumps(r,indent=2)+'\n')
for arm in ('J','SJ','T'):print(arm,r[arm]['median'])
PY
