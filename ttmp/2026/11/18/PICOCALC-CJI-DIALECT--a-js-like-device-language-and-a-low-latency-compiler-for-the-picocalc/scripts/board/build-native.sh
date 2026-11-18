#!/usr/bin/env bash
# Use the repository's ordinary IDF configuration again when the diagnostic is built.
set -eo pipefail
board=$(realpath picocalc-os/port/esp32p4)
idf=$(jq -r .idf_path "$board/build-elf/project_description.json")
source "$idf/export.sh"
perf=(ttmp/2026/11/18/*CJI-PERF*/scripts)
trap '(cd "$board" && idf.py -B build-elf -D PICOCALC_PROFILE_TOOL= build)' EXIT
bash "$perf/22-board-variant.sh" "${1:?new image directory}" "${2:?candidate stage1.slir}"
