#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd -- "$here/../../../../../../.." && pwd)
cd "$repo"
build=$(mktemp -d)
trap 'rm -rf -- "$build"' EXIT
make -C picocalc-os typed-world-reactor all
python3 picocalc-os/tools/embed-chess-painter.py picocalc-os/worlds/chess/painter.typed "$build/embedded.typed"
node "$here/live-producer.mjs" "$build/embedded.typed"
cc -std=c11 -Wall -Wextra -Werror -O1 -g -fsanitize=address,undefined -fno-pie -no-pie \
    -I picocalc-os/sdk/typed picocalc-os/sdk/typed/chess-psix.c "$here/replay-codec.c" -o "$build/replay-codec"
node "$here/replay-fixtures.mjs" > "$build/fixtures.bin"
ASAN_OPTIONS=detect_leaks=0 "$build/replay-codec" < "$build/fixtures.bin"
mapfile -t objects < <(rg --files --hidden --no-ignore picocalc-os/build/{eng,nucleus,sim,host,wamr} -g '*.o' |
    rg -v '/(kernel|native|main_host)\.o$')
cc -std=gnu11 -D_GNU_SOURCE -DPICOCALC_MOBILE_PAINTER=1 -O1 -g \
    -fsanitize=address,undefined -fno-pie -no-pie -I picocalc-os/nucleus \
    "$here/mailbox.c" picocalc-os/nucleus/native.c "${objects[@]}" -lm -lz -lpthread -o "$build/mailbox"
ASAN_OPTIONS=detect_leaks=0 "$build/mailbox"
