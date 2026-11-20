#!/bin/sh
# From the repository root: output-directory reactor-elf P4-GCC rv32emu [logical-CPU].
set -eu
[ "$#" -ge 4 ] && [ "$#" -le 5 ] || { sed -n '2p' "$0" >&2; exit 2; }
root=$(git rev-parse --show-toplevel)
[ "$PWD" = "$root" ]
elf=$(realpath "$2")
gcc=$(realpath "$3")
emulator=$(realpath "$4")
cpu=${5:-}
here=$(realpath --relative-to="$root" "$(dirname "$0")")
wasm=picocalc-os/build/typed-world-reactor.wasm
phase=$(find ttmp/2026/11/19 -path '*/PICOCALC-COMPILER-ISSUE--*/scripts/04-compile-phase-timing.c')
old=$(find ttmp/2026/11/19 -path '*/PICOCALC-FRONTEND-COLD--*/scripts/08-quickjs.c')
continuations=$(find ttmp/2026/11/19 -maxdepth 1 -name 'PICOCALC-CONTINUATION-G--*')
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$1"
output=$(realpath "$1")
run() {
    if [ -n "$cpu" ]; then taskset -c "$cpu" "$@"
    else "$@"; fi
}
build() {
    cc -O2 -I picocalc-os/third_party/quickjs -o "$1" "$2" picocalc-os/build/qjs/*.o -lm -lpthread
}
python3 "$here/10-stage-eager-cursor.py" "$work" > "$output/staging.json"
{
    date -Iseconds
    lscpu | awk '/^Architecture:|^Model name:/'
    printf 'CPU affinity %s\n' "${cpu:-unbound}"
    node --version
    git show --no-patch --format='%H %aI %s' 1357545 2e4fee1
    sha256sum "$wasm" "$elf" "$here/10-stage-eager-cursor.py" "$here/11-check-eager-cursor.mjs"
} > "$output/environment.txt"
sed 's/CLOCK_MONOTONIC/CLOCK_PROCESS_CPUTIME_ID/' "$phase" > "$work/phase-cpu.c"
build "$work/phase-cpu" "$work/phase-cpu.c"
for lane in pre-g-regex g4-regex g4-cursor pre-g-cursor pre-g-cursor g4-cursor g4-regex pre-g-regex; do
    data=$(run "$work/phase-cpu" "$work/$lane" "$work/$lane/editor.typed" "$wasm" "$elf" "$here/06-signature-reuse-timing.js")
    printf '{"variant":"%s","receipt":%s}\n' "$lane" "$data"
done > "$output/linked-cpu.jsonl"
build "$work/quickjs-lex" "$old"
node "$here/11-check-eager-cursor.mjs" "$work" "$elf" "$work/quickjs-lex" > "$output/parity.json"
build "$work/quickjs-alloc" "$continuations/scripts/15-benchmark-quickjs.c"
for lane in g4-regex g4-cursor; do
    data=$(run "$work/quickjs-alloc" "$work/$lane" "$work/$lane/editor.typed" rv32 4)
    printf '{"variant":"%s","receipt":%s}\n' "$lane" "$data"
done > "$output/quickjs-allocation.jsonl"
staged="$work/fixture-tree"
mkdir -p "$staged/picocalc-os/compiler"
cp "$work/g4-cursor/"*.js "$staged/picocalc-os/compiler/"
git archive 2e4fee1 picocalc-os/worlds | tar -x -C "$staged"
for directory in build sdk third_party; do
    ln -s "$root/picocalc-os/$directory" "$staged/picocalc-os/$directory"
done
for file in "$here/01-check-functions-differential.mjs" \
    "$continuations/scripts/14-check-async-layout.mjs" \
    ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--*/scripts/lowering/rv32.mjs \
    ttmp/2026/11/19/PICOCALC-EDITOR-ASYNC--*/scripts/0[23]-*; do
    mkdir -p "$staged/$(dirname "$file")"
    cp "$file" "$staged/$file"
    sha256sum "$file" >> "$output/environment.txt"
done
cd "$staged"
node ttmp/2026/11/19/PICOCALC-LANGUAGE-E--*/scripts/01-check-functions-differential.mjs "$gcc" "$emulator" > "$output/language.json"
node ttmp/2026/11/19/PICOCALC-CONTINUATION-G--*/scripts/14-check-async-layout.mjs > "$output/continuations.txt"
node ttmp/2026/11/19/PICOCALC-EDITOR-ASYNC--*/scripts/03-check-editor-event-interleaving.mjs "$gcc" "$emulator" > "$output/editor.jsonl"
