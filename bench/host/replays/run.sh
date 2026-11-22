#!/usr/bin/env bash
# The 24 host workflows that gate every change to the Typed compiler's defaults: Files, Agenda and Editor compiled
# to WASM and RV32, linked against the native-world SDK and run on rv32emu.
#
#   bench/host/replays/run.sh                                   # the compiler's own defaults
#   bench/host/replays/run.sh --options '{"policy":"kernel"}'   # every compile with these default options
#   bench/host/replays/run.sh --gcc PATH --emu PATH
#
# --options sets TYPED_RV32_OPTIONS, which bench/lib/compiler.mjs applies to every typedRv32.compile call (also the
# calls typed-world.js makes). GCC and emulator default as in bench/lib/toolchain.sh. Exits with the number of
# failed workflows.
set -euo pipefail
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$root"
gcc= emu=
while (( $# )); do
    case $1 in
        --options) export TYPED_RV32_OPTIONS=$2; shift 2 ;;
        --gcc) gcc=$2; shift 2 ;;
        --emu) emu=$2; shift 2 ;;
        *) echo "usage: $0 [--options JSON] [--gcc PATH] [--emu PATH]" >&2; exit 2 ;;
    esac
done
P4_GCC=${gcc:-${P4_GCC:-}} RV32EMU=${emu:-${RV32EMU:-}}
source bench/lib/toolchain.sh
gcc=$P4_GCC emu=$RV32EMU
make -s -C firmware build/picocalc-host typed-world-reactor files-reactor agenda-reactor
here=bench/host/replays
log=$(mktemp)
trap 'rm -f "$log"' EXIT
failures=0
run() {
    local script=$1
    shift
    local arguments="${*##*/}"
    if node "$here/$script" "$@" > "$log" 2>&1; then
        printf 'PASS %s%s\n' "$script" "${arguments:+ $arguments}"
        tail -n 2 "$log" | cut -c1-300 | sed 's/^/    /'
    else
        printf 'FAIL %s%s\n' "$script" "${arguments:+ $arguments}"
        cat "$log"
        failures=$((failures + 1))
    fi
}
echo "options: ${TYPED_RV32_OPTIONS:-the compiler defaults}"
run files-wasm.mjs
run files-rv32.mjs "$gcc" "$emu"
run editor-layout.mjs "$gcc" "$emu"
run agenda-calendar.mjs
run agenda-leads.mjs
run agenda-task-records.mjs
run agenda-wasm-world.mjs
run agenda-rv32-parser.mjs "$gcc" "$emu"
run agenda-local-inference.mjs
run agenda-entry-tokens.mjs "$gcc" "$emu"
run editor-empty-view.mjs "$gcc" "$emu"
run editor-world.mjs "$gcc" "$emu"
for option in --large --edit --positions --find --markdown --preview-large --preview-line --preview-inline --preview-dense-inline --dense-search --tail-search --late-navigation; do
    run editor-world.mjs "$gcc" "$emu" "$option"
done
echo "$((24 - failures))/24 workflows passed"
exit "$failures"
