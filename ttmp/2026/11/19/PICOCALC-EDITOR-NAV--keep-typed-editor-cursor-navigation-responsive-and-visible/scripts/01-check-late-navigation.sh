#!/usr/bin/env bash
set -euo pipefail

if (( $# != 3 )); then
    echo "usage: $0 P4_GCC RV32EMU OUTPUT_DIRECTORY" >&2
    exit 2
fi
cd "$(git rev-parse --show-toplevel)"
base=(ttmp/2026/11/18/PICOCALC-TYPED-WORLDS*/scripts)
capacity=(ttmp/2026/11/19/PICOCALC-EDITOR-CAPACITY*/scripts)
mkdir -p "$3"
"${capacity[0]}/04-check-search-traversal.sh" "$1" "$2" "$3/search"
node "${base[0]}/02-check-editor-world.mjs" "$1" "$2" --late-navigation --keep-fixture
fixture_log=$(mktemp)
trap 'rm -f "$fixture_log"' EXIT
if ! node "${base[0]}/02-check-editor-world.mjs" "$1" "$2" --large --keep-fixture 2>"$fixture_log"; then
    cat "$fixture_log" >&2
    exit 1
fi
cat "$fixture_log" >&2
fixture=$(sed -n '/^\/tmp\/typed-editor-reactor-/p' "$fixture_log")
node "${base[0]}/05-measure-large-editor.mjs" "$fixture" "$3/after-match" --after-match
node --input-type=module - "$3/after-match/results.json" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const result = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const workflow of ['tail-right', 'tail-up']) {
    assert.deepEqual(result['wasm/' + workflow],
        {input_bytes:65536, finished:true, file_bytes_match:true, faults:[]});
}
JS
