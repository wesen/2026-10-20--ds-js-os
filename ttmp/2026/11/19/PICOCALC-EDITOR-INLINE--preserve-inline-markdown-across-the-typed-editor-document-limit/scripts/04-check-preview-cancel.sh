#!/usr/bin/env bash
set -euo pipefail
if (( $# != 2 )); then
    echo "usage: $0 RETAINED_PREVIEW_DENSE_INLINE_FIXTURE OUTPUT_DIRECTORY" >&2
    exit 2
fi
cd "$(git rev-parse --show-toplevel)"
fixture=$(realpath "$1")
mkdir "$2"
output=$(realpath "$2")
for engine in js wasm; do
    dir="$output/$engine"
    mkdir -p "$dir/fs"
    cp "$fixture/$engine/fs/entry.MD" "$dir/fs/"
    cat > "$dir/keys.txt" <<'KEYS'
wait 2000
key d
wait 530
key enter
wait 2200
key f6
wait 140
key f6
wait 1800
capture cancelled.png
key f6
wait 6000
KEYS
    for (( page=0; page<8; page++ )); do
        printf 'key pgdn\nwait 530\n' >> "$dir/keys.txt"
    done
    printf 'capture final.png\n' >> "$dir/keys.txt"
    picocalc-os/build/picocalc-host -j "$fixture/$engine/js" -f "$dir/fs" -o "$dir/out" "$dir/keys.txt"
    log="$dir/out/uart.log"
    if rg -q 'editor crashed' "$log"; then exit 1; fi
    node --input-type=module - "$log" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const log = readFileSync(process.argv[2], 'utf8');
const last = log.split('probe: EDITOR_FRAME\n').at(-1);
const frame = JSON.parse([...last.matchAll(/EDITOR_PART (.*)$/gm)].map(part => part[1]).join(''));
assert.equal(frame.tree.kids[1].t, 'lines');
assert.match(frame.tree.kids[1].items.map(row => row.s).join(' '), /EOF INLINE/);
JS
    cmp "$fixture/$engine/fs/entry.MD" "$dir/fs/entry.MD"
done
cmp "$output"/{js,wasm}/out/cancelled.png
cmp "$output"/{js,wasm}/out/final.png
