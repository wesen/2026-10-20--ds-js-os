# Sourced by bench scripts: P4_GCC is the newest installed ESP-IDF RISC-V GCC (ESP-IDF 5.4 ships 14.2; older ones
# lack the zicsr/zifencei ISA syntax the replays use), and RV32EMU is bench/emu/build/rv32emu, built if missing.
# Either may be set beforehand to override.
if [[ -z ${P4_GCC:-} ]]; then
    P4_GCC=$(for c in "$HOME"/.espressif/tools/riscv32-esp-elf/*/riscv32-esp-elf/bin/riscv32-esp-elf-gcc; do
                 [[ -x $c ]] && echo "$("$c" -dumpversion) $c"; done | sort -V | tail -1 | cut -d' ' -f2-)
    [[ -n $P4_GCC ]] || { echo "no riscv32-esp-elf-gcc under ~/.espressif; set P4_GCC" >&2; return 2; }
fi
if [[ -z ${RV32EMU:-} ]]; then
    make -s -C "$(git rev-parse --show-toplevel)/bench/emu"
    RV32EMU=$(git rev-parse --show-toplevel)/bench/emu/build/rv32emu
fi
export P4_GCC RV32EMU
