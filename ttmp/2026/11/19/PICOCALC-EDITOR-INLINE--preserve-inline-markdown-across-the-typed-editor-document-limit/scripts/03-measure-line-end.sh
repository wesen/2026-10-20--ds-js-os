#!/usr/bin/env bash
set -euo pipefail
if (( $# != 2 )); then
    echo "usage: $0 RETAINED_PREVIEW_INLINE_FIXTURE OUTPUT_DIRECTORY" >&2
    exit 2
fi
cd "$(git rev-parse --show-toplevel)"
fixture=$(realpath "$1")
mkdir "$2"
output=$(realpath "$2")
for engine in js wasm; do
    dir="$output/$engine"
    mkdir -p "$dir/fs" "$dir/store/w"
    cp "$fixture/$engine/fs/entry.MD" "$dir/fs/"
    cat > "$dir/keys.txt" <<'KEYS'
wait 2000
key d
wait 530
key enter
wait 1800
key f5
wait 2000
capture eof.png
key esc
wait 1000
KEYS
    cat > "$dir/reopen.txt" <<'KEYS'
wait 2000
key d
wait 530
key enter
wait 3000
capture reopened.png
KEYS
    picocalc-os/build/picocalc-host -j "$fixture/$engine/js" -f "$dir/fs" -s "$dir/store" -o "$dir/out" "$dir/keys.txt"
    picocalc-os/build/picocalc-host -j "$fixture/$engine/js" -f "$dir/fs" -s "$dir/store" -o "$dir/reopened" "$dir/reopen.txt"
    rg -o 'entry\.MD  [0-9]+:[0-9]+|editor crashed.*' "$dir"/{out,reopened}/uart.log | tail -5
    rg -q 'entry\.MD  1:65473' "$dir/reopened/uart.log"
    if rg -q 'editor crashed' "$dir"/{out,reopened}/uart.log; then exit 1; fi
done
cmp "$output"/{js,wasm}/reopened/reopened.png
