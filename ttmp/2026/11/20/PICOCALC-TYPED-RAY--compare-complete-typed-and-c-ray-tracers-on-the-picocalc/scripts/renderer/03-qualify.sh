#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
out=$(realpath -m "${1:?provide a scratch directory}")
mkdir -p "$out"
cd "$root"
cc -std=c11 -O2 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -fno-sanitize-recover=all \
    -I picocalc-os/nucleus "$here/01-reference.c" picocalc-os/nucleus/raytrace_demo.c -o "$out/reference"
"$out/reference" "$out" > "$out/cases.json"
node "$here/02-wasm.mjs" "$out"
