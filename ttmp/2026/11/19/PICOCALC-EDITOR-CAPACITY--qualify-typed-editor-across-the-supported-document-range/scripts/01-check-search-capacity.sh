#!/usr/bin/env bash
set -euo pipefail

if (( $# != 3 )); then
    echo "usage: $0 P4_GCC RV32EMU OUTPUT_DIRECTORY" >&2
    exit 2
fi
cd "$(git rev-parse --show-toplevel)"
toolchain=$1
emulator=$2
output=$3
typed_worlds=(ttmp/2026/11/18/PICOCALC-TYPED-WORLDS*/scripts)
make -C picocalc-os typed-world-reactor
node "${typed_worlds[0]}/02-check-editor-world.mjs" "$toolchain" "$emulator" --find
node "${typed_worlds[0]}/02-check-editor-world.mjs" "$toolchain" "$emulator" --markdown
fixture_report=$(mktemp)
trap 'rm -f "$fixture_report"' EXIT
node "${typed_worlds[0]}/02-check-editor-world.mjs" "$toolchain" "$emulator" \
    --large --keep-fixture 2>"$fixture_report" || {
    cat "$fixture_report" >&2
    exit 1
}
cat "$fixture_report" >&2
fixture=$(sed -n '/^\/tmp\/typed-editor-reactor-/p' "$fixture_report")
node "${typed_worlds[0]}/05-measure-large-editor.mjs" "$fixture" "$output"
node --input-type=module - "$output/results.json" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const backend of ['js', 'wasm']) {
    for (const operation of ['find', 'save']) {
        assert.deepEqual(report[backend + '/' + operation],
            {input_bytes:65536, finished:true, file_bytes_match:true, faults:[]});
    }
}
JS
