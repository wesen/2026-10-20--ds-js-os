#!/usr/bin/env bash
set -eu
cd "$(git rev-parse --show-toplevel)"
ticket=ttmp/2026/11/21/PICOCALC-SIMD-LAB--choosing-simd-packet-boundaries-in-the-typed-compiler-on-esp32-p4
archive=ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes
study=ttmp/2026/11/21/PICOCALC-PIE-LOOPS--infer-and-lower-packed-loop-regions-in-unchanged-typed-programs
port=3793
input="$ticket/various/evidence/ray.json"
if [[ "${1:-baseline}" == candidates ]]; then
    port=3794
    input=$(mktemp -t p4-simd-candidates.XXXXXX.json)
    python3 "$ticket/scripts/evidence/08-combine.py" "$input" "$ticket/various/evidence/ray.json" "$ticket/various/evidence/candidates.json" "$ticket/various/physics/repl-study.json"
    trap 'rm -f -- "$input"' EXIT
fi
go run ./cmd/trace-repl serve --addr "127.0.0.1:$port" --archive "$archive" --device-study "$study" --simd-study "$input"
