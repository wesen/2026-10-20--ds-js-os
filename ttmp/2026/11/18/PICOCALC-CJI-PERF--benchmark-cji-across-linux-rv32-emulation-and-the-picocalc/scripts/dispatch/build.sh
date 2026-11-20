#!/usr/bin/env bash
set -euo pipefail
out=$(realpath -m "$1")
mkdir -p "$out"
src=$(realpath "$(dirname "$0")")
cji=$(realpath cji)
if ! command -v ld.lld >/dev/null; then
    export PATH="$(rustc --print target-libdir)/../bin/gcc-ld:$PATH"
fi
make -C picocalc-os build/picocalc-host
make -C "$cji" slas rv32-nw-units PICOCALC="$(realpath picocalc-os)"
world="$src/bench.world.js"
unit="$cji/build/rv32/unit"
node "$cji/cji.js" "$world" --native --emit > "$out/native.slir"
"$cji/slas" -S -c "$out/native.o" "$out/native.slir"
cc -O2 -g -no-pie -DCJI_AOT -I"$cji/runtime" -I"$cji/tools" -Ipicocalc-os/sdk -Ipicocalc-os/third_party/quickjs \
    "$src/host.c" "$cji/runtime/nw_world.c" "$cji/runtime/runtime.c" "$out/native.o" \
    picocalc-os/build/qjs/*.o -lm -lpthread -ldl -o "$out/host"
node "$cji/cji.js" "$world" --world-unit --emit > "$out/unit.slir"
node "$cji/tools/link-units.mjs" "$unit/prelude-unit.slir" "$out/unit.slir" > "$out/linked.slir"
"$cji/slas-rv32" -c "$out/bench.so" --module --extern "$unit/unit.list" "$out/linked.slir"
