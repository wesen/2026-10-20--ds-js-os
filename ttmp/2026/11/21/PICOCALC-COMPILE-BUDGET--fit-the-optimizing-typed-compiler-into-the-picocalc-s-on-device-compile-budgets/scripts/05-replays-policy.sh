#!/usr/bin/env bash
# COMPILE-BUDGET copy of RAY-PARITY's 04-replays.sh: the third argument (a typed-rv32.js variant, e.g. one whose
# default policy is "interactive") is loaded through COMPILER-THESIS's replay-baseline.mjs hook.
# Run the existing 24 host workflows used in PICOCALC-NATIVE-NEXT A0.
# Copy of PICOCALC-COMPILER-THESIS scripts/lowering/replay.sh. The Editor world checks run the copy in
# 04-check-editor-world.mjs, which also links sdk/typed/chess-psix.c: world.c calls chess_psix_encode
# since the Chess PSIX work of 2026-11-20, and the original replay fails at link time without it.
set -euo pipefail
if (( $# < 2 || $# > 3 )); then
    echo "usage: bash $0 <P4-GCC> <rv32emu> [historic-lowerer.js]" >&2
    exit 2
fi
gcc=$1
emu=$2
node_command=(node)
if (( $# == 3 )); then
    export PICOCALC_BASELINE_LOWERER="$3"
    # The hook lives beside the original replay; it swaps globalThis.typedRv32 for the given file.
    node_command+=(--import "$(git rev-parse --show-toplevel)/ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc/scripts/lowering/replay-baseline.mjs")
fi
make -s -C picocalc-os build/picocalc-host typed-world-reactor files-reactor agenda-reactor
files=(ttmp/2026/11/18/PICOCALC-TYPED-APPS--*/scripts)
editor=(ttmp/2026/11/18/PICOCALC-TYPED-WORLDS--*/scripts)
fixed=(ttmp/2026/11/21/PICOCALC-RAY-PARITY--make-typed-compiler-optimizations-cumulative-and-close-the-ray-tracer-s-gap-to-c/scripts)
agenda=(ttmp/2026/11/18/PICOCALC-AGENDA-COMPILER--*/scripts)
log=$(mktemp)
trap 'rm -f "$log"' EXIT
failures=0
run() {
    local script=$1
    shift
    local arguments="${*##*/}"
    if "${node_command[@]}" "$script" "$@" > "$log" 2>&1; then
        printf 'PASS %s%s\n' "${script##*/}" "${arguments:+ $arguments}"
        tail -n 2 "$log" | cut -c1-300 | sed 's/^/    /'
    else
        printf 'FAIL %s%s\n' "${script##*/}" "${arguments:+ $arguments}"
        cat "$log"
        failures=$((failures + 1))
    fi
}
run "$files/01-check-files-wasm.mjs"
run "$files/02-check-files-rv32.mjs" "$gcc" "$emu"
run "$files/07-check-editor-layout.mjs" "$gcc" "$emu"
run "$agenda/01-check-calendar.mjs"
run "$agenda/02-check-leads.mjs"
run "$agenda/03-check-task-records.mjs"
run "$agenda/04-check-wasm-world.mjs"
run "$agenda/07-check-rv32-parser.mjs" "$gcc" "$emu"
run "$agenda/14-check-local-inference.mjs"
run "$agenda/16-check-entry-tokens.mjs" "$gcc" "$emu"
run "$editor/01-check-editor-empty-view.mjs" "$gcc" "$emu"
run "$fixed/04-check-editor-world.mjs" "$gcc" "$emu"
for option in --large --edit --positions --find --markdown --preview-large --preview-line --preview-inline --preview-dense-inline --dense-search --tail-search --late-navigation; do
    run "$fixed/04-check-editor-world.mjs" "$gcc" "$emu" "$option"
done
exit "$failures"
