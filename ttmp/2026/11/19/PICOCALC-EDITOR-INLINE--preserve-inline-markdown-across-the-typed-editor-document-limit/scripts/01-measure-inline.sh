#!/usr/bin/env bash
set -euo pipefail

if (( $# != 2 )); then
    echo "usage: $0 RETAINED_LARGE_EDITOR_FIXTURE OUTPUT_DIRECTORY" >&2
    exit 2
fi
cd "$(git rev-parse --show-toplevel)"
runner=(ttmp/2026/11/18/PICOCALC-TYPED-WORLDS*/scripts/05-measure-large-editor.mjs)
node "${runner[0]}" "$1" "$2" --long-inline
