#!/usr/bin/env bash
# Add symbols to the qualified binary without changing its machine-code text.
set -euo pipefail
base=$(realpath "${1:?baseline directory}")
guard=$(realpath "${2:?qualified candidate directory}")
out=$(realpath -m "${3:?output directory}")
cji=$(realpath cji)
sampler=$(realpath ttmp/2026/11/18/*CJI-PERF*/scripts/host-sampling)
mkdir -p "$out"
SLAS_SYMBOLS=1 "$cji/slas" -S -c "$out/named.o" "$guard/stage1.slir"
cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie -DCJI_PROFILE_GC -I"$cji/runtime" \
    "$cji/runtime/aot_main.c" "$cji/runtime/runtime.c" "$out/named.o" -lm -o "$out/stage1-named"
objcopy -O binary --only-section=.text "$guard/stage1" "$out/qualified.text"
objcopy -O binary --only-section=.text "$out/stage1-named" "$out/named.text"
cmp "$out/qualified.text" "$out/named.text"
cp "$base/agenda.ref" "$base/files.ref" "$out/"
bash "$sampler/run.sh" "$out"
