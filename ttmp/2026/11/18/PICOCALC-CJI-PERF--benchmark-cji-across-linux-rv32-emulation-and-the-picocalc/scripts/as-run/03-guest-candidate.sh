#!/usr/bin/env bash
# The independent candidate can run while the two 8 MiB guest profiles finish.
set -euo pipefail
src=/tmp/nov18-perf-base
out=/tmp/nov18-perf-guest-candidate
mkdir -p "$out"
cji=(ttmp/2026/11/17/*--cji-workspace*/sources/cji)
stem="$out/agenda-10-guest"
taskset -c 2 "${cji[0]}/build/rv32/rv32emu" "$src/fw-stage1-profile.elf" -- -C -g -h 10485760 -H 10485760 -- picocalc-os/js/apps/agenda.js --world-unit > "$stem.ir" 2>"$stem.stats"
cmp "$src/agenda.ref" "$stem.ir"
echo 'agenda:10 matched'
