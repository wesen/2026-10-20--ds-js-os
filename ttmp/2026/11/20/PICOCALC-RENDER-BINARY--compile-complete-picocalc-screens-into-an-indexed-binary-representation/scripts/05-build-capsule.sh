#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(git rev-parse --show-toplevel)
nucleus=$root/picocalc-os/nucleus
lab=$here/../../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/scripts
temporary=$(mktemp -d /tmp/pico-binary-fonts.XXXXXXXX)
trap 'rm -r "$temporary"' EXIT
cc -O2 -I "$nucleus" -ffunction-sections -fdata-sections "$lab/03-raster-driver.c" \
    "$nucleus/gfx.c" "$nucleus/util.c" -Wl,--gc-sections -o "$temporary/raster"
"$temporary/raster" --fonts > "$temporary/fonts.json"
node "$here/04-capsule.mjs" "$temporary/fonts.json" "$@"
