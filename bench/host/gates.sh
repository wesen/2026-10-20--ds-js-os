#!/usr/bin/env bash
# The host gates every Typed compiler change runs, with one set of options:
#   1. the opening ray frame (bench/host/ray-profile.mjs): output digest = bench/reference/ray-opening.json;
#   2. the Chess engine oracle (bench/host/chess-engine.mjs): 6,981 words agree with chess 1.11.2;
#   3. the 24 host workflows (bench/host/replays/run.sh).
#
#   bench/host/gates.sh                                  # the compiler's defaults
#   bench/host/gates.sh --options '{"policy":"kernel"}'
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
options=
if (( $# )); then
    [[ $1 == --options && $# == 2 ]] || { echo "usage: $0 [--options JSON]" >&2; exit 2; }
    options=$2
fi
source bench/lib/toolchain.sh
echo "== ray profile"
if [[ -n $options ]]; then node bench/host/ray-profile.mjs --options "$options"; else node bench/host/ray-profile.mjs --policy default; fi | sed -n 2p
echo "== Chess engine oracle"
TYPED_RV32_OPTIONS=$options node bench/host/chess-engine.mjs "$P4_GCC" "$RV32EMU" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);
        if(r.wordsMatched!==6981)process.exit(console.log("FAIL words",r.wordsMatched)||1);
        console.log(r.wordsMatched+" words match; engine "+r.engineInstructions.toLocaleString()+" instructions, "+r.engineImageBytes+" B")})'
echo "== replays"
if [[ -n $options ]]; then bench/host/replays/run.sh --options "$options"; else bench/host/replays/run.sh; fi | tail -1
