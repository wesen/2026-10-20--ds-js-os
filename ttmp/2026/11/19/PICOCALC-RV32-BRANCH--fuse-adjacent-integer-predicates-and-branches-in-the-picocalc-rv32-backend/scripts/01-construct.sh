#!/usr/bin/env bash
# Extract both typed compiler bundles from one revision and patch the candidate lowerer.
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: bash $0 <new output directory>" >&2
    exit 2
fi

revision=6426798f69c691f5c1979233ebdeb540f8ce7c61
here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
mkdir "$1"
destination=$(cd "$1" && pwd)
for lane in baseline candidate; do
    mkdir -p "$destination/$lane/picocalc-os/compiler" "$destination/$lane/typed"
    for part in wasm rv32 world; do
        path="picocalc-os/compiler/typed-$part.js"
        git -C "$root" show "$revision:$path" > "$destination/$lane/$path"
    done
done
patch --quiet --batch --forward --fuzz=0 -p1 -d "$destination/candidate" < "$here/02-predicate-fusion.patch"
for lane in baseline candidate; do
    for part in wasm rv32 world; do
        mv "$destination/$lane/picocalc-os/compiler/typed-$part.js" "$destination/$lane/typed/$part.js"
    done
    rmdir "$destination/$lane/picocalc-os/compiler" "$destination/$lane/picocalc-os"
done
(cd "$destination" && sha256sum {baseline,candidate}/typed/{wasm,rv32,world}.js)
