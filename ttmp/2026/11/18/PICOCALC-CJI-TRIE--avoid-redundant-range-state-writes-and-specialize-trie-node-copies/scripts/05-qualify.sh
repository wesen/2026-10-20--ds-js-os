#!/usr/bin/env bash
set -euo pipefail
dir=${1:?candidate}
guard=${2:?guarded control executable}
archive=${3:?original fixture archive}
r=(ttmp/2026/11/18/*CJI-RANGES*/scripts)
# Calc's capped compiled diagnostic differs from stage zero. Inspect it via script 32.
result=0
python3 "$r/31-native-catalog.py" "$dir/stage1" --link picocalc-os/port/esp32p4/build-elf/cji > "$dir/catalog.jsonl" || result=$?
test "$result" -le 1
bash "$r/32-native-rejections.sh" "$guard" "$dir/stage1" "$dir/rejections" > "$dir/rejections.log"
python3 "$r/35-qualify-catalog.py" "$dir/catalog.jsonl" "$dir/rejections" > "$dir/catalog-summary.json"
bash "$r/38-run-original-suite.sh" "$archive" "$dir/stage1" "$dir/book" > "$dir/book-receipt.txt"
