#!/usr/bin/env bash
# Run the existing 24 host workflows used in PICOCALC-NATIVE-NEXT A0.
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
    node_command+=(--import "$(cd "$(dirname "$0")" && pwd)/replay-baseline.mjs")
fi
make -s -C picocalc-os build/picocalc-host typed-world-reactor files-reactor agenda-reactor
files=(ttmp/2026/11/18/PICOCALC-TYPED-APPS--*/scripts)
editor=(ttmp/2026/11/18/PICOCALC-TYPED-WORLDS--*/scripts)
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
run "$editor/02-check-editor-world.mjs" "$gcc" "$emu"
for option in --large --edit --positions --find --markdown --preview-large --preview-line --preview-inline --preview-dense-inline --dense-search --tail-search --late-navigation; do
    run "$editor/02-check-editor-world.mjs" "$gcc" "$emu" "$option"
done
exit "$failures"
