#!/usr/bin/env bash
# Render the project's Linux simulator with disposable, reproducible seeded storage.
set -euo pipefail
scripts=$(realpath "$(dirname "$0")")
out=$(mktemp -d)
cp -R picocalc-os/fs-seed "$out/fs"
picocalc-os/build/picocalc-host -j picocalc-os/js -w 2026-10-22T09:41:00 -z UTC0 \
    -o "$out" -s "$out/store" -f "$out/fs" "$scripts/host-agenda.txt" > "$out/console.log"
cp "$out/linux-agenda.png" "$scripts/../../various/figures/"
