#!/usr/bin/env bash
# Reuse the measured runtime objects. Verify the control relink before substituting stage 1.
set -euo pipefail
dest=$(realpath -m "${1:?output directory}")
ir=$(realpath "${2:?candidate stage1.slir}")
board=$(realpath picocalc-os/port/esp32p4)
cji=$(realpath cji)
build="$board/build-elf"
objects="$build/cji/tool"
mkdir -p "$dest"
grep -qx 'PICOCALC_COMPILER_PROFILE:BOOL=ON' "$build/CMakeCache.txt"
grep -qx 'PICOCALC_HEADLESS:BOOL=ON' "$build/CMakeCache.txt"
linker=$(command -v ld.lld || true)
if [[ -z $linker ]]; then linker="$(rustc --print target-libdir)/../bin/gcc-ld/ld.lld"; fi
link() {
    (cd "$objects" && "$linker" -m elf32lriscv --shared -Bsymbolic --gc-sections --no-relax -z notext \
       -z max-page-size=16 --no-undefined --strip-all -e compiler_entry \
       tool.o runtime.o libc.o softfloat.o jump.o slas.o sljitLir.o "$1" -o "$2")
}
link "$cji/build/rv32/stage1/stage1-ilp32.o" "$dest/control-tool.elf"
cmp "$dest/control-tool.elf" "$objects/compiler.elf"
"$cji/slas-rv32" -S --rootstack-slack 4096 -c "$dest/rv32.o" "$ir"
node "$cji/tools/rv32/unit.mjs" ilp32 "$dest/rv32.o" "$dest/ilp32.o"
link "$dest/ilp32.o" "$dest/compiler.elf"
python3 "$board/main/pack_elf.py" "$dest/compiler.elf" "$dest/compiler.elf.z"
(cd "$board" && idf.py -B build-elf -D "PICOCALC_PROFILE_TOOL=$dest/compiler.elf.z" build)
cp "$build"/picocalc-os-p4.{bin,elf} "$build/CMakeCache.txt" "$dest"
mkdir -p "$dest/esp-idf/main"
cp "$build/esp-idf/main/system.cji.json" "$dest/esp-idf/main"
sha256sum "$ir" "$dest"/{control-tool.elf,compiler.elf,picocalc-os-p4.bin,picocalc-os-p4.elf} > "$dest/identities.sha256"
