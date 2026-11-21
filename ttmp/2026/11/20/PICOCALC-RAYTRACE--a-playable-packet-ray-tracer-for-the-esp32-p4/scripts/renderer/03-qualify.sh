#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
prefix=${1:?provide the installed ESP-IDF riscv32-esp-elf prefix}
out=${2:?provide an output directory}
mkdir -p "$out"
target="$root/picocalc-os/nucleus"
for mode in scalar model; do
    flags=()
    if [[ "$mode" == model ]]; then flags=(-DRAYTRACE_DEMO_TEST_PIE); fi
    cc -std=c11 -O2 -g -Wall -Wextra -Werror -pedantic -fsanitize=undefined -fno-sanitize-recover=all \
        "${flags[@]}" -I "$target" "$target/raytrace_demo.c" "$here/01-host.c" -lm -o "$out/host-$mode"
    "$out/host-$mode" > "$out/host-$mode.json"
done
"$prefix-gcc" -nostdlib -march=rv32imafc_zicsr_zifencei_xesppie -mabi=ilp32f \
    -Wl,--no-relax,-Ttext=0,-e,raytrace_demo_pie_row "$target/raytrace_demo_pie.S" -o "$out/row.elf"
"$prefix-objcopy" -O binary -j .text "$out/row.elf" "$out/row.bin"
"$prefix-objdump" -d -j .text -M numeric,no-aliases "$out/row.elf" > "$out/row.asm"
node "$here/02-pie-model.mjs" "$out/row.bin" "$out/row.asm" "$out/pie-model.json"
