#!/usr/bin/env bash
set -euo pipefail
scratch=$(realpath "${1:?build root}")
shift
p=(ttmp/2026/11/18/*CJI-PERF*/scripts)
board=$(realpath picocalc-os/port/esp32p4)
idf=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["idf_path"])' "$board/build-elf/project_description.json")
source "$idf/export.sh" > "$scratch/idf-environment.log" 2>&1
restore_build() { (cd "$board" && idf.py -B build-elf -D PICOCALC_PROFILE_TOOL= build); }
trap restore_build EXIT
for name in "$@"; do
    bash "$p/22-board-variant.sh" "$scratch/firmware/$name" "$scratch/$name/stage1.slir"
done
