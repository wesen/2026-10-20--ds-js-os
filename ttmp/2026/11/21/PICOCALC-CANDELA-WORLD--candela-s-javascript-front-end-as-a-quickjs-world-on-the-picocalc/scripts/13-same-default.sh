#!/usr/bin/env bash
# 13-same-default.sh WORKTREE BASE_REV: do vm.c and kernel.c preprocess to the same text as BASE_REV's when
# PICOCALC_CANDELA_WORLD is not defined (with the host's defaults, and with the P4 playable build's guards)?
set -euo pipefail
wt=$1; base=$2
scratch=$(mktemp -d)
mkdir -p "$scratch/base/nucleus"
for f in nucleus.h kernel.c vm.c; do git -C "$wt" show "$base:picocalc-os/nucleus/$f" > "$scratch/base/nucleus/$f"; done
cp "$wt"/picocalc-os/nucleus/*.h "$scratch/base/nucleus/" 2>/dev/null || true
git -C "$wt" show "$base:picocalc-os/nucleus/nucleus.h" > "$scratch/base/nucleus/nucleus.h"
inc="-I$wt/picocalc-os/third_party/quickjs -I$wt/picocalc-os/host -I$wt/picocalc-os/sdk"
for defs in "" "-DPICOCALC_TYPED_AGENDA=1 -DPICOCALC_TYPED_CHESS=1 -DPICOCALC_MOBILE_PAINTER=1 -DPICOCALC_TYPED_EDITOR=1 -DPICOCALC_TYPED_FILES=1 -DNUCLEUS_WASM=1"; do
  for f in kernel.c vm.c; do
    gcc -E -P -std=gnu11 -D_GNU_SOURCE -DCONFIG_VERSION='"x"' $defs $inc -I"$wt/picocalc-os/nucleus" "$wt/picocalc-os/nucleus/$f" > "$scratch/new-$f.i"
    gcc -E -P -std=gnu11 -D_GNU_SOURCE -DCONFIG_VERSION='"x"' $defs $inc -I"$scratch/base/nucleus" "$scratch/base/nucleus/$f" > "$scratch/old-$f.i"
    if cmp -s "$scratch/new-$f.i" "$scratch/old-$f.i"; then echo "same: $f [$defs]"; else echo "DIFFERENT: $f [$defs]"; diff "$scratch/old-$f.i" "$scratch/new-$f.i" | head -20; fi
  done
done
