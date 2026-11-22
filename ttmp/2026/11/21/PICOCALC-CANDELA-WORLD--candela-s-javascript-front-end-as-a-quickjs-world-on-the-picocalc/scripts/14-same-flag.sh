#!/usr/bin/env bash
# 14-same-flag.sh WORKTREE BASE_REV: with PICOCALC_CANDELA_WORLD defined, do vm.c and kernel.c preprocess to BASE_REV's text?
set -euo pipefail
W=$1; base=$2
S=$(mktemp -d)
mkdir -p "$S/base/nucleus"
cp "$W"/picocalc-os/nucleus/*.h "$S/base/nucleus/"; ln -s "$W/picocalc-os/sdk" "$S/base/sdk"
for f in nucleus.h kernel.c vm.c; do git -C "$W" show "$base:picocalc-os/nucleus/$f" > "$S/base/nucleus/$f"; done
D="-std=gnu11 -D_GNU_SOURCE -DCONFIG_VERSION=\"x\" -DPICOCALC_CANDELA_WORLD=1 -DPICOCALC_TYPED_AGENDA=1 -DPICOCALC_TYPED_CHESS=1 -DPICOCALC_MOBILE_PAINTER=1 -I$W/picocalc-os/third_party/quickjs"
for f in vm.c kernel.c; do
  gcc -E -P $D -I"$W/picocalc-os/nucleus" "$W/picocalc-os/nucleus/$f" > "$S/new-$f.i"
  gcc -E -P $D -I"$S/base/nucleus" "$S/base/nucleus/$f" > "$S/old-$f.i"
  if cmp -s "$S/new-$f.i" "$S/old-$f.i"; then echo "same with the flag: $f"; else echo "DIFFERENT with the flag: $f"; diff "$S/old-$f.i" "$S/new-$f.i" | head -20 || true; fi
done
