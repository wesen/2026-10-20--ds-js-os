#!/usr/bin/env bash
# Execute the book's original pass/interpreter/backend suite using the guarded native stage 1.
set -euo pipefail
archive=$(realpath "${1:?original archive}")
stage1=$(realpath "${2:?guarded native executable}")
out=$(realpath -m "${3:?fresh scratch directory}")
cji=$(realpath cji)
mkdir -p "$out"
work=$(mktemp -d "$out/suite-XXXXXX")
unzip -qo "$archive" 'book/cji/run-tests.js' 'book/cji/tests/*' -d "$work"
root="$work/book/cji"
cp -r "$cji/src" "$cji/package.json" "$cji/slas" "$root/"
(cd "$root" && node --stack-size=4000 run-tests.js "--stage1=$stage1") > "$out/suite.log" 2>&1
tail -1 "$out/suite.log"
