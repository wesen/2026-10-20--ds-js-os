#!/usr/bin/env bash
set -euo pipefail

if (( $# != 2 )); then
    echo "usage: $0 P4_GCC RV32EMU" >&2
    exit 2
fi
cd "$(git rev-parse --show-toplevel)"
typed_worlds=(ttmp/2026/11/18/PICOCALC-TYPED-WORLDS*/scripts)
make -C picocalc-os typed-world-reactor build/picocalc-host
for trial in --markdown --preview-large --preview-line; do
    node "${typed_worlds[0]}/02-check-editor-world.mjs" "$1" "$2" "$trial" --keep-fixture
done
