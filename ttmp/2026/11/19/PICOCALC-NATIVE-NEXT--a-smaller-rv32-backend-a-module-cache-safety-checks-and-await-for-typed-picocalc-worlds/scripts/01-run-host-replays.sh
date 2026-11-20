#!/usr/bin/env bash
# Run every existing host replay of the typed applications and print one PASS/FAIL line per check.
# These 24 checks are the "existing cross-target replays" that every task of PICOCALC-NATIVE-NEXT must keep passing.
# usage: 01-run-host-replays.sh P4_GCC RV32EMU
#   P4_GCC   riscv32-esp-elf-gcc of the ESP-IDF toolchain
#   RV32EMU  build/rv32/rv32emu of the CJI tree under ttmp/2026/11/17/PICOCALC-CJI--*/sources/cji
# Exit status is the number of failed checks.
set -uo pipefail
if (( $# != 2 )); then sed -n 2,7p "$0" >&2; exit 2; fi
log=$(mktemp); failed=0; trap 'rm -f "$log"' EXIT
cd "$(git rev-parse --show-toplevel)"
make -s -C picocalc-os build/picocalc-host typed-world-reactor files-reactor agenda-reactor >/dev/null
GCC=$1
EMU=$2
A=(ttmp/2026/11/18/PICOCALC-TYPED-APPS*/scripts); W=(ttmp/2026/11/18/PICOCALC-TYPED-WORLDS*/scripts); G=(ttmp/2026/11/18/PICOCALC-AGENDA-COMPILER*/scripts)
run() { local s=$(date +%s.%N); if "$@" >"$log" 2>&1; then r=PASS; else r=FAIL; failed=$((failed+1)); fi; printf '%s %.1fs %s\n' $r $(echo "$(date +%s.%N) - $s" | bc) "$(echo "$*" | sed 's|ttmp/[^ ]*/scripts/||g; s|/home[^ ]*/||g')"; tail -2 "$log" | cut -c1-300 | sed 's/^/    /'; }
run node $A/01-check-files-wasm.mjs
run node $A/02-check-files-rv32.mjs $GCC $EMU
run node $A/07-check-editor-layout.mjs $GCC $EMU
run node $G/01-check-calendar.mjs
run node $G/02-check-leads.mjs
run node $G/03-check-task-records.mjs
run node $G/04-check-wasm-world.mjs
run node $G/07-check-rv32-parser.mjs $GCC $EMU
run node $G/14-check-local-inference.mjs
run node $G/16-check-entry-tokens.mjs $GCC $EMU
run node $W/01-check-editor-empty-view.mjs $GCC $EMU
for t in "" --large --edit --positions --find --markdown --preview-large --preview-line --preview-inline --preview-dense-inline --dense-search --tail-search --late-navigation; do run node $W/02-check-editor-world.mjs $GCC $EMU $t; done
exit $failed
