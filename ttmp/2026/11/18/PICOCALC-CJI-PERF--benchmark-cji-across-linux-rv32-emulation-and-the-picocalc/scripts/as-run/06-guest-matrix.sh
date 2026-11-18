#!/usr/bin/env bash
# Long-running guest jobs need a persistent tmux owner. Exact ELF identities are pinned.
set -euo pipefail
cd /home/manuel/code/wesen/2026-10-20--ds-js-os
out=/tmp/nov18-perf-base
cji=(ttmp/2026/11/17/*--cji-workspace*/sources/cji)
emu="${cji[0]}/build/rv32/rv32emu"
measure() {
    local cpu=$1 firmware=$2 mib=$3 prefix=$4 kind=$5
    local bytes=$((mib * 1024 * 1024))
    local dump="$out/$prefix.ir" log="$out/$prefix.stats"
    local env_args=()
    if [[ $kind == rank ]]; then env_args=(RV32_PROFILE=1 RV32_STEPS=1); log="$out/$prefix.log"; fi
    if cmp -s "$dump" "$out/agenda.ref" && grep -q ' instructions' "$log"; then return; fi
    env "${env_args[@]}" taskset -c "$cpu" "$emu" "$firmware" -- -C -g -h "$bytes" -H "$bytes" -- picocalc-os/js/apps/agenda.js --world-unit > "$dump" 2> "$log"
    cmp "$dump" "$out/agenda.ref"
    echo "$prefix matched"
}
measure 3 /tmp/cji-perf-guide.b17g7D/fw-stage1.elf 8 agenda.rv32 rank & rank=$!
measure 0 "$out/fw-stage1-profile.elf" 8 agenda-8-guest metrics & baseline=$!
measure 2 "$out/fw-stage1-profile.elf" 10 agenda-10-guest metrics & candidate=$!
status=0
for job in "$rank" "$baseline" "$candidate"; do wait "$job" || status=1; done
exit "$status"
