#!/usr/bin/env bash
# Run from the repository root. Supply a scratch directory for large artifacts.
set -euo pipefail
out=$(realpath -m "$1")
mkdir -p "$out"
cji=$(realpath ttmp/2026/11/17/PICOCALC-CJI--*/sources/cji)
if ! command -v ld.lld >/dev/null; then
    export PATH="$(rustc --print target-libdir)/../bin/gcc-ld:$PATH"
fi
make -C "$cji" slas rv32-stage1
ir="$cji/build/rv32/stage1/stage1.slir"
"$cji/slas" -S -c "$out/stage1.o" "$ir"
for variant in plain measured; do
    flags=()
    if [[ $variant == measured ]]; then flags=(-DCJI_PROFILE_GC); fi
    cc -std=gnu11 -O2 -g -fno-omit-frame-pointer -no-pie "${flags[@]}" -I"$cji/runtime" "$cji/runtime/aot_main.c" "$cji/runtime/runtime.c" "$out/stage1.o" -lm -o "$out/stage1-$variant"
done
ln -sf stage1-plain "$out/stage1-host"
cp "$cji/build/rv32/fw-stage1.elf" "$out/fw-stage1.elf"
for world in files agenda; do
    node "$cji/cji.js" "picocalc-os/js/apps/$world.js" --world-unit --emit >"$out/$world.ref"
done
