#!/usr/bin/env bash
# Recreate the held-out oracle and the cross-study programs from this checkout.
set -euo pipefail
if (( $# != 2 )); then
    echo "Usage: 10-replay-host.sh NEW_SCRATCH_DIR RV32_ESP_ELF_GCC" >&2
    exit 2
fi
here=$(cd -- "$(dirname -- "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
work=$(realpath -m -- "$1")
gcc=$(realpath -- "$2")
mkdir -- "$work"
cd -- "$repo"
node "$here/heldout/01-burst-oracle.mjs" "$work/stock.json"
cmp "$work/stock.json" "$here/heldout/control.json"
node "$here/09-compose-native-arms.mjs" "$work/arms"
arms=(early-stock early-leaf early-inline late-stock late-leaf late-inline)
files=()
for arm in "${arms[@]}"; do files+=("$work/arms/$arm.json"); done
python3 "$here/02-prepare-matrix.py" "$work/board" "$here/heldout" "${files[@]}"
python3 "$here/05-model-matrix.py" "$work/board" "$gcc" "$work/model.json"
cmp "$work/arms/composition.json" "$here/../../various/director/composition.json"
cmp "$work/model.json" "$here/../../various/director/composed-rv32-model.json"
