#!/usr/bin/env bash
# Run one profiler at a time from the repository root.
# profile.sh WORKDIR native|rv32 WORLD [WORLD ...]
set -euo pipefail
out=$(realpath "$1")
kind=$2
shift 2
cji=$(realpath ttmp/2026/11/17/PICOCALC-CJI--*/sources/cji)
for world in "$@"; do
    source_file="picocalc-os/js/apps/$world.js"
    args=(-C -g -h 8388608 -H 8388608 -- "$source_file" --world-unit)
    case "$kind" in
        native) valgrind --tool=callgrind --callgrind-out-file="$out/$world.cg" "$out/stage1-host" "${args[@]}" >"$out/$world.native.ir" 2>"$out/$world.native.log" ;;
        rv32) RV32_STEPS=1 RV32_PROFILE=1 "$cji/build/rv32/rv32emu" "$out/fw-stage1.elf" -- "${args[@]}" >"$out/$world.rv32.ir" 2>"$out/$world.rv32.log" ;;
        *) echo "expected native or rv32" >&2; exit 2 ;;
    esac
    cmp "$out/$world.ref" "$out/$world.$kind.ir"
    echo "$kind $world matched"
done
