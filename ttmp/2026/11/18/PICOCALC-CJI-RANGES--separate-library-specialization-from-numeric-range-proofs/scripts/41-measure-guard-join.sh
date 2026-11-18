#!/usr/bin/env bash
# Compare only the marginal cost of joining equal IDs once the proof schedule is guarded.
set -euo pipefail
base=$(realpath "${1:?baseline reference directory}")
guard=$(realpath "${2:?guarded executable directory}")
out=$(realpath -m "${3:?new combination directory}")
scripts=$(realpath "$(dirname "$0")")
perf=$(realpath ttmp/2026/11/18/*CJI-PERF*/scripts)
mkdir -p "$out/control"
cp "$guard/stage1" "$out/control/stage1-measured"
cp "$base/agenda.ref" "$base/files.ref" "$out/control/"
bash "$scripts/20-build-deferred.sh" "$out" guard-join
for world in agenda files; do
    samples="$out/$world-samples"
    bash "$scripts/25-time-deferred.sh" "$out/control" "$out" "$world" "$samples"
    python3 "$perf/16-candidate-report.py" "$out/control" guard-join --world "$world" \
        --case-dir "$samples" --candidate-exe "$out/stage1" > "$out/$world.json"
done
