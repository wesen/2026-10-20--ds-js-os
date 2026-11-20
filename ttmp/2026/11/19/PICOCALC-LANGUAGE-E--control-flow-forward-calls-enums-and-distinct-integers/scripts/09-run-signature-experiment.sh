#!/bin/sh
# Run from the repository root. Arguments: output directory, shared reactor ELF, optional CPU.
set -eu
[ "$#" -ge 2 ] && [ "$#" -le 3 ] || { sed -n '2p' "$0" >&2; exit 2; }
output=$1
elf=$2
cpu=${3:-}
here=$(dirname "$0")
phase=$(find ttmp/2026/11/19 -path '*/PICOCALC-COMPILER-ISSUE--*/scripts/04-compile-phase-timing.c')
wasm=picocalc-os/build/typed-world-reactor.wasm
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$output"
python3 "$here/05-signature-reuse-experiment.py" "$work" > /dev/null
cc -O2 -I picocalc-os/third_party/quickjs -o "$work/phase" "$phase" picocalc-os/build/qjs/*.o -lm -lpthread
sed 's/CLOCK_MONOTONIC/CLOCK_PROCESS_CPUTIME_ID/' "$phase" > "$work/phase-cpu.c"
cc -O2 -I picocalc-os/third_party/quickjs -o "$work/phase-cpu" "$work/phase-cpu.c" picocalc-os/build/qjs/*.o -lm -lpthread
cc -O2 -I picocalc-os/third_party/quickjs -o "$work/load" "$here/07-compiler-load.c" picocalc-os/build/qjs/*.o -lm -lpthread
run() {
    if [ -n "$cpu" ]; then taskset -c "$cpu" "$@"
    else "$@"; fi
}
{
    date -Iseconds
    lscpu | awk '/^Architecture:|^Model name:/'
    printf 'CPU affinity %s\n' "${cpu:-unbound}"
    git show --no-patch --format='%H %aI %s' 289281c 1357545 7b321a9
    sha256sum "$wasm" "$elf"
    (cd "$work" && sha256sum control/*.js pre-g/*.js g4/*.js pre-g/editor.typed g4/editor.typed)
} > "$output/environment.txt"
node "$here/08-verify-signature-reuse.mjs" "$work" "$elf" > "$output/byte-parity.json"
run "$work/load" 289281c "$work/control" 1357545 "$work/pre-g" 7b321a9 "$work/g4" \
    7b321a9 "$work/g4" 1357545 "$work/pre-g" 289281c "$work/control" > "$output/eval.csv"
collect() {
    for kind in pre-g g4 reuse reuse g4 pre-g g4-profile reuse-profile; do
        data=$(run "$1" "$work/$kind" "$work/$kind/editor.typed" "$wasm" "$elf" "$here/06-signature-reuse-timing.js")
        printf '{"variant":"%s","receipt":%s}\n' "$kind" "$data"
    done
}
collect "$work/phase" > "$output/phase-timing.jsonl"
collect "$work/phase-cpu" > "$output/phase-timing-cpu.jsonl"
