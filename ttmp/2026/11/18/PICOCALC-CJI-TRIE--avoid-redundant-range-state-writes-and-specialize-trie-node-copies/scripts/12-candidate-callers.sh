#!/usr/bin/env bash
# Run STATIC's diagnostic counters on the newly bootstrapped compiler.
set -euo pipefail
build=$(realpath "${1:?root containing candidate subdirectories}")
refs=$(realpath "${2:?reference directory}")
shift 2
static=(ttmp/2026/11/18/*CJI-STATIC*/scripts)
cji=$(realpath cji)
for v in "$@"; do
    named="$build/$v/named"
    mkdir -p "$named"
    SLAS_SYMBOLS=1 "$cji/slas" -S -c "$named/named.o" "$build/$v/stage1.slir"
    cp "$refs/agenda.ref" "$refs/files.ref" "$named/"
    bash "$static/03-measure-sites.sh" "$named" "$build/$v/callers"
done
