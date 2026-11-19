#!/usr/bin/env bash
set -euo pipefail

if (( $# != 3 )); then
    echo "usage: $0 P4_GCC RV32EMU OUTPUT_DIRECTORY" >&2
    exit 2
fi
cd "$(git rev-parse --show-toplevel)"
scripts=(ttmp/2026/11/18/PICOCALC-TYPED-WORLDS*/scripts)
make -C picocalc-os typed-world-reactor
fixture_log=$(mktemp)
trap 'rm -f "$fixture_log"' EXIT
if ! node "${scripts[0]}/02-check-editor-world.mjs" "$1" "$2" --large --keep-fixture 2>"$fixture_log"; then
    cat "$fixture_log" >&2
    exit 1
fi
cat "$fixture_log" >&2
fixture=$(sed -n '/^\/tmp\/typed-editor-reactor-/p' "$fixture_log")
node "${scripts[0]}/05-measure-large-editor.mjs" "$fixture" "$3" --adversarial
node --input-type=module - "$3/results.json" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const result = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const backend of ['js', 'wasm']) {
    for (const query of ['find-dense', 'find-tail']) {
        assert.deepEqual(result[backend + '/' + query],
            {input_bytes:65536, finished:true, file_bytes_match:true, faults:[]});
    }
}
JS
for trial in --dense-search --tail-search --find --markdown --edit --positions; do
    node "${scripts[0]}/02-check-editor-world.mjs" "$1" "$2" "$trial"
done
