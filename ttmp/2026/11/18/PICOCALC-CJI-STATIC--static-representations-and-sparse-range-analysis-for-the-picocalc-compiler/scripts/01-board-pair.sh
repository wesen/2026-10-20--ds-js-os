#!/usr/bin/env bash
# Run in a fresh directory to preserve previous interrupted receipts.
set -euo pipefail
out=${1:?new output directory}
snap=${2:?existing control and guard firmware directory}
perf=(ttmp/2026/11/18/*CJI-PERF*/scripts)
mkdir "$out"
for name in control guard; do
    mkdir "$out/$name"
    for f in CMakeCache.txt esp-idf picocalc-os-p4.bin picocalc-os-p4.elf; do
        ln -s "$(realpath "$snap/$name/$f")" "$out/$name/$f"
    done
done
cp "$snap/guard/identities.sha256" "$out/guard/"
bash "$perf/18-headless-smoke.sh" "$out/control" "$out/control"
python3 "$perf/05-board-runs.py" "$out/control" --firmware-elf "$out/control/picocalc-os-p4.elf" --board-condition 'Headless P4; keyboard, power, display and compositor omitted' agenda:8
bash "$perf/24-board-candidates.sh" "$out" guard
