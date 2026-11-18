#!/bin/bash
set -eu
c=$(echo ttmp/2026/11/17/*--cji-workspace*/sources/cji)
out=/tmp/nov18-perf-base
b=/tmp/cji-perf-guide.b17g7D
kind=$1
shift
for w in "$@"; do
  src=picocalc-os/js/apps/$w.js
  args=(-C -g -h 8388608 -H 8388608 -- "$src" --world-unit)
  case "$kind" in
    rv32) RV32_PROFILE=1 "$c/build/rv32/rv32emu" "$b/fw-stage1.elf" -- "${args[@]}" >"$out/$w.$kind.ir" 2>"$out/$w.$kind.log";;
    native) valgrind --tool=callgrind --callgrind-out-file="$out/$w.cg" "$b/stage1-host" "${args[@]}" >"$out/$w.$kind.ir" 2>"$out/$w.$kind.log";;
  esac
  cmp "$out/$w.ref" "$out/$w.$kind.ir"
  echo "$w $kind matched"
done
