#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
studies=$(cd "$here/../../.." && pwd)
root=$(cd "$studies/../../../.." && pwd)
engine="$root/picocalc-os/third_party/quickjs"
system=("$studies"/PICOCALC-RENDER-SYSTEM--*)
output=$1
work=$(mktemp -d /tmp/psix-observed.XXXXXXXX)
trap 'rm -rf "$work"' EXIT

python3 - "${system[0]}/scripts/14-host-heap.c" "$work/meter.c" <<'PY'
from pathlib import Path
import sys

source, destination = map(Path, sys.argv[1:])
code = source.read_text()
start = code.index('      printf("{\\"resident\\"')
end = code.index('      JS_FreeCString(ctx,v);', start)
code = code[:start] + r'''      JS_RunGC(rt);
      printf("{\"resident\":%zu,\"peak\":%zu,\"highWaterAboveStart\":%zu,\"liveAboveStart\":%zu,\"result\":%s}",
             start,m.peak,m.peak-start,m.used>start?m.used-start:0,v);
''' + code[end:]
destination.write_text(code)
PY

cc -O2 -D_GNU_SOURCE -DCONFIG_VERSION='"2026-06-04"' -I"$engine" "$work/meter.c" \
    "$engine"/{quickjs,libregexp,libunicode,dtoa,cutils}.c -lm -lpthread -ldl -o "$output"
