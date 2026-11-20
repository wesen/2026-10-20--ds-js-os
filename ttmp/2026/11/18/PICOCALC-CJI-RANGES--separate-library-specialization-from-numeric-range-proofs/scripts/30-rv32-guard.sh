#!/usr/bin/env bash
# Execute the corrected RV32 frontend on the host and validate its output and nested instruction counts.
set -euo pipefail
base=$(realpath "${1:?baseline profiling build}")
variant=$(realpath "${2:?candidate RV32 object directory}")
out=$(realpath -m "${3:?output directory}")
world=${4:?world name}
cji=$(realpath cji)
b="$cji/build/rv32"
mkdir -p "$out"
linker=$(command -v ld.lld || true)
if [[ -z $linker ]]; then linker="$(rustc --print target-libdir)/../bin/gcc-ld/ld.lld"; fi
link_guest() {
    "$linker" -m elf32lriscv --no-relax -Ttext=0x10000 -e _start -o "$2" \
        "$base/stage1-main-profile.o" "$1" "$base/runtime-profile.o" "$b/libc.o" "$b/hostcalls.o" "$b/softfloat.o"
}
link_guest "$b/stage1/stage1-ilp32.o" "$out/control.elf"
cmp "$out/control.elf" "$base/fw-stage1-profile.elf"
link_guest "$variant/ilp32.o" "$out/guard.elf"
file=$(jq -er --arg w "$world" '.worlds[]|select(.name==$w)|.file' picocalc-os/js/system.json)
node "$cji/cji.js" "picocalc-os/js/$file" --world-unit --emit > "$out/ref.ir"
for name in guard control; do
    if [[ $name == control && ${5:-} == --await-control ]]; then
        # Another worker already owns the identical ordinary guest and heap configuration.
        # Wait for both a complete world unit and terminal instruction statistics.
        for ((i=0; i<1440; i++)); do
            if grep -q ' instructions' "$base/$world-8-guest.stats" && cmp -s "$base/$world-8-guest.ir" "$out/ref.ir"; then break; fi
            sleep 10
        done
        grep -q ' instructions' "$base/$world-8-guest.stats"
        cmp "$base/$world-8-guest.ir" "$out/ref.ir"
    fi
    if [[ $name == control && -s $base/$world-8-guest.stats ]] && cmp -s "$base/$world-8-guest.ir" "$out/ref.ir"; then
        cp "$base/$world-8-guest.stats" "$out/control.stats"
    else
        "$b/rv32emu" "$out/$name.elf" -- -C -g -h 8388608 -H 8388608 -- "picocalc-os/js/$file" --world-unit \
            > "$out/$name.ir" 2> "$out/$name.stats"
        cmp "$out/ref.ir" "$out/$name.ir"
    fi
done
sha256sum "$out"/{control.elf,guard.elf,ref.ir} > "$out/verified.sha256"
