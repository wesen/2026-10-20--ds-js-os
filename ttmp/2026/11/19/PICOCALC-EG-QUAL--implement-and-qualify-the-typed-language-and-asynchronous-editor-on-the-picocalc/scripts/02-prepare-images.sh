#!/usr/bin/env bash
# Build Editor/Files/Agenda with the same firmware profile from a named source revision.
set -euo pipefail
root=$(git rev-parse --show-toplevel)
work=$1
rev=$2
idf=$3
lane=$4
mkdir -p "$work/$lane"
checkout="$work/$lane/checkout"
if [[ ! -d "$checkout/.git" ]]; then
    git clone --quiet --local --no-checkout "$root" "$checkout"
    git -C "$checkout" checkout --quiet --detach "$rev"
fi
test "$(git -C "$checkout" rev-parse HEAD)" = "$(git -C "$root" rev-parse "$rev")"
port=picocalc-os/port/esp32p4
if [[ ! -d "$checkout/$port/managed_components" ]]; then
    cp -a --reflink=auto "$root/$port/managed_components" "$checkout/$port/managed_components"
fi
if [[ ! -d "$checkout/picocalc-os/build" ]]; then
    cp -a --reflink=auto "$root/picocalc-os/build" "$checkout/picocalc-os/build"
fi
cd "$checkout"
recipe=("$root"/ttmp/2026/11/18/PICOCALC-TYPED-WORLDS--*/scripts/03-build-editor-firmware.sh)
for target in wasm rv32; do
    cp "$root/$port/sdkconfig.agent-elf" "$work/$lane/sdkconfig"
    bash "${recipe[0]}" "$idf" "$work/$lane/build" "$work/$lane/sdkconfig" "$target" "$work/$lane/images/$target" > "$work/$lane/$target-build.log" 2>&1
done
sha256sum "$work/$lane/images/"*/picocalc-os-p4.bin
