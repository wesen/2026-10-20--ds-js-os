#!/usr/bin/env bash
# Repeat the original matrix after Callgrind exits, on core 1 with no profiler on sibling 5.
set -euo pipefail
src=/tmp/nov18-perf-base
out=/tmp/nov18-perf-host-repeat
mkdir -p "$out"
for file in stage1-plain stage1-measured agenda.ref files.ref; do
    ln -sf "$src/$file" "$out/$file"
done
perf=(ttmp/2026/11/18/*CJI-PERF--*/scripts)
taskset -c 1 python3 "${perf[0]}/03-host-runs.py" "$out"
python3 "${perf[0]}/07-summarize.py" "$out" > "$out/report.json"
