#!/usr/bin/env bash
# Build a separate instrumented guest; output equality is required for every run.
set -euo pipefail
out=$(realpath "$1")
shift
cji=$(realpath cji)
b="$cji/build/rv32"
linker=$(command -v ld.lld || true)
if [[ -z $linker ]]; then linker="$(rustc --print target-libdir)/../bin/gcc-ld/ld.lld"; fi
flags=(--target=riscv32-unknown-elf -march=rv32imc -mabi=ilp32 -O2 -nostdinc -isystem "$(clang -print-resource-dir)/include" -isystem "$cji/tools/rv32/fw/include" -I"$cji/runtime" -fno-pic -mno-relax -DCJI_PROFILE_GC)
clang "${flags[@]}" -c "$cji/runtime/runtime.c" -o "$out/runtime-profile.o"
clang "${flags[@]}" -c "$cji/tools/rv32/fw/stage1_main.c" -o "$out/stage1-main-profile.o"
"$linker" -m elf32lriscv --no-relax -Ttext=0x10000 -e _start -o "$out/fw-stage1-profile.elf" "$out/stage1-main-profile.o" "$b/stage1/stage1-ilp32.o" "$out/runtime-profile.o" "$b/libc.o" "$b/hostcalls.o" "$b/softfloat.o"
for spec in "$@"; do
    world=${spec%:*}
    mib=${spec#*:}
    bytes=$((mib * 1024 * 1024))
    stem="$out/$world-$mib-guest"
    "$b/rv32emu" "$out/fw-stage1-profile.elf" -- -C -g -h "$bytes" -H "$bytes" -- "picocalc-os/js/apps/$world.js" --world-unit >"$stem.ir" 2>"$stem.stats"
    cmp "$out/$world.ref" "$stem.ir"
done
