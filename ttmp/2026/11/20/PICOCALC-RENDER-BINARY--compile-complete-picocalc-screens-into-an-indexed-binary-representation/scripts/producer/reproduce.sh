#!/usr/bin/env bash
set -euo pipefail
dir=$(cd "$(dirname "$0")" && pwd)
lib=${1:-/home/manuel/esp/esp-idf-5.4.2/components/json/cJSON}
out=${2:-/tmp/pico-binary-native-producer}
mkdir -p "$out"
cc -std=gnu11 -O2 -Wall -Wextra -Wno-unused-function -I"$lib" "$dir/host.c" "$lib/cJSON.c" -lm -o "$out/host"
cc -std=gnu11 -O2 -Wall -Wextra -Wno-unused-function -I"$lib" "$dir/heap.c" "$lib/cJSON.c" -lm -Wl,--wrap=malloc,--wrap=realloc,--wrap=free -o "$out/heap"
cc -std=gnu11 -O2 -Wall -Wextra -Wno-unused-function -I"$lib" "$dir/verify.c" "$lib/cJSON.c" -lm -o "$out/verify"
"$out/verify" > "$out/verify.log"
for app in sysmon chess snake editor; do
  for arm in G B; do "$out/heap" "$app-$arm"; done
done > "$out/allocation.ndjson"
for block in 0 1 2 3 4 5 6 7 8; do
  if ((block%2)); then arms=(B G); else arms=(G B); fi
  for app in sysmon chess snake editor; do
    for arm in "${arms[@]}"; do "$out/host" "$app-$arm" 32; done
  done
done > "$out/host.log"
python3 "$dir/summarize.py" "$out/host.log" "$out/host-summary.json"
