#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
out=$(realpath -m "${1:?provide a scratch directory}")
mkdir -p "$out"
cd "$root"
cc -std=c11 -O2 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -fno-sanitize-recover=all \
    -I picocalc-os/nucleus "$here/01-geometry.c" picocalc-os/nucleus/{candela_scene,raytrace_demo}.c -o "$out/geometry"
node "$here/02-typed-host.mjs" build "$out"
names=(shared-0 shared-128 shared-256 tiles-64 tiles-73 tiles-128 tiles-fallback)
"$out/geometry" reject "$out/shared-0.graph" unused unused
for name in "${names[@]}"; do
    "$out/geometry" record "$out/$name.graph" "$out/$name.materials" unused
done
node "$here/02-typed-host.mjs" shade "$out"
for name in "${names[@]}"; do
    "$out/geometry" replay "$out/$name.graph" "$out/$name.colors" "$out/$name.rgb565" > "$out/$name.stats.json"
done
node "$here/02-typed-host.mjs" verify "$out"
