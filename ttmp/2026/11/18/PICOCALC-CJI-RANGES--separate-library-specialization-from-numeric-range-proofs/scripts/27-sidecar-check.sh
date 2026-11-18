#!/usr/bin/env bash
# Run candidate record and strict replay against a sidecar written by the ordinary compiler.
set -euo pipefail
candidate=$(realpath "${1:?candidate source directory}")
out=$(realpath -m "${2:?scratch directory}")
ordinary=$(realpath ttmp/2026/11/17/*--cji-workspace*/sources/cji)
mkdir -p "$out"
input=picocalc-os/js/apps/files.js
node "$ordinary/cji.js" "$input" --world-unit --emit --emit-sidecar "$out/control.sidecar" > "$out/control.ir"
node "$candidate/cji.js" "$input" --world-unit --emit --emit-sidecar "$out/candidate.sidecar" > "$out/record.ir"
cmp "$out/control.sidecar" "$out/candidate.sidecar"
cmp "$out/control.ir" "$out/record.ir"
node "$candidate/cji.js" "$input" --world-unit --emit --sidecar "$out/control.sidecar" \
    --sidecar-strict --sidecar-log > "$out/replay.ir" 2> "$out/replay.log"
cmp "$out/control.ir" "$out/replay.ir"
cat "$out/replay.log"
sha256sum "$out/control.ir" "$out/control.sidecar"
