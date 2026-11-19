#!/usr/bin/env bash
# Run the firmware's real C caller on Linux in both modes, using the same Editor reactor.
set -euo pipefail
main=$(realpath "${1:?pass the ESP-IDF build/esp-idf/main directory}")
repo=$(git rev-parse --show-toplevel)
os=$repo/picocalc-os
port=$os/port/esp32p4/main
entry=("$repo"/ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--*/scripts/supervisor/cold-entry.c)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work"/{freertos,typed,editor}
touch "$work/freertos/FreeRTOS.h"
echo 'typedef void *QueueHandle_t;' > "$work/freertos/queue.h"
for file in wasm rv32 world; do
    cp "$os/compiler/typed-$file.js" "$work/typed/$file.js"
done
cp "$main/editor.typed" "$work/editor/editor.typed"
cp "$main/typed-world-reactor.elf" "$work/editor/reactor.bin"
objects=("$os"/build/eng/{quickjs,libregexp,libunicode,cutils,dtoa}.o)
cd "$work"
for mode in streamed buffered; do
    flags=()
    if [[ $mode == buffered ]]; then flags+=(-DPICOCALC_RV32_BUFFER_FUNCTIONS=1); fi
    cc -O2 -D_POSIX_C_SOURCE=200809L -DPICOCALC_TYPED_EDITOR=1 -DPICOCALC_RV32_EDITOR=1 "${flags[@]}" \
        -I. -I"$port" -I"$os/nucleus" -I"$os/third_party/quickjs" "${entry[0]}" \
        "$port/typed_p4.c" "$port/editor_p4.c" "${objects[@]}" -lm -lpthread -o run
    ./run > "$mode.log"
    grep -Fx "editor native compiler functions=$mode" "$mode.log"
    mv compiled.elf "$mode.elf"
done
cmp streamed.elf buffered.elf
sha256sum streamed.elf buffered.elf
