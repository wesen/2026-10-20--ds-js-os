#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then echo "usage: $0 WORK" >&2; exit 2; fi
work=$1
here=$(cd -- "$(dirname -- "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
mkdir -p -- "$work"
work=$(cd -- "$work" && pwd)
cd "$root"
lexical=$(find ttmp/2026/11/20 -maxdepth 1 -name 'PICOCALC-LEXICAL-INDEX--*')
language=$(find ttmp/2026/11/19 -maxdepth 1 -name 'PICOCALC-LANGUAGE-E--*')
phase=$(find ttmp/2026/11/19 -path '*/PICOCALC-COMPILER-ISSUE--*/scripts/04-compile-phase-timing.c')

python3 "$language/scripts/13-stage-span-reuse.py" "$work"
for pair in pre-e:289281c e5:c5e2839; do
  lane=${pair%:*}
  revision=${pair#*:}
  mkdir -- "$work/$lane"
  for file in typed-wasm typed-rv32 typed-world; do
    git show "$revision:picocalc-os/compiler/$file.js" > "$work/$lane/$file.js"
  done
done
while IFS= read -r part; do
  git show "289281c:picocalc-os/worlds/editor/$part"
  printf '\n'
done < <(git show 289281c:picocalc-os/worlds/editor/source.list) > "$work/editor.typed"

for lane in parser compact table-cursor indexed; do
  mkdir -- "$work/$lane"
  cp "$work/stock/"*.js "$work/$lane/"
done
node "$lexical/scripts/02-index-overlay.mjs" "$work/indexed/typed-wasm.js"
node "$lexical/scripts/10-reuse-token-overlay.mjs" "$work/indexed"
for lane in indexed-parser indexed-prepass indexed-spans composed; do cp -a "$work/indexed" "$work/$lane"; done
for lane in indexed-spans composed; do python3 "$language/scripts/13-stage-span-reuse.py" "$work/$lane" --apply-existing; done
for lane in indexed-prepass composed; do node "$language/scripts/14-indexed-prepass-overlay.mjs" "$work/$lane"; done
cp -a "$work/composed" "$work/composed-direct"
cp -a "$work/composed" "$work/composed-portable"
python3 "$here/05-stage-bounded-dispatch.py" "$work/parser" parser
python3 "$here/05-stage-bounded-dispatch.py" "$work/compact" compact
python3 "$here/05-stage-bounded-dispatch.py" "$work/table-cursor" cursor
python3 "$here/05-stage-bounded-dispatch.py" "$work/indexed-parser" indexed
python3 "$here/05-stage-bounded-dispatch.py" "$work/composed-direct" indexed --direct
python3 "$here/05-stage-bounded-dispatch.py" "$work/composed-portable" indexed --direct --compact-fallback

cp "$phase" "$work/professor.c"
cp "${phase%.c}.js" "$work/professor.js"
cp "$work/professor.c" "$work/professor-index.c"
patch -s --fuzz=0 "$work/professor-index.c" < "$here/../sources/02-professor-native-binding.patch"
sed 's/CLOCK_MONOTONIC/CLOCK_PROCESS_CPUTIME_ID/' "$work/professor.c" > "$work/professor-cpu.c"
sed 's/CLOCK_MONOTONIC/CLOCK_PROCESS_CPUTIME_ID/' "$work/professor-index.c" > "$work/professor-index-cpu.c"
os="$root/picocalc-os"
compile() {
  local exe=$1 source=$2
  shift 2
  cc -O2 -I "$os/third_party/quickjs" -I "$lexical/scripts" "$source" "$@" \
    "$os"/build/qjs/*.o -lm -lpthread -o "$work/$exe"
}
compile professor-wall "$work/professor.c"
compile professor-cpu "$work/professor-cpu.c"
compile professor-index-wall "$work/professor-index.c" "$lexical/scripts/01-typed-lex-index.c"
compile professor-index-cpu "$work/professor-index-cpu.c" "$lexical/scripts/01-typed-lex-index.c"
sha256sum "$work/editor.typed" "$work/professor.c" "$work/professor.js" "$work/professor-index.c" \
  "$os/build/typed-world-reactor.wasm" "$work/"{composed,composed-direct,composed-portable}"/typed-wasm.js" \
  "$lexical/scripts/01-typed-lex-index.c" "$os"/build/qjs/*.o > "$work/inputs.sha256"
