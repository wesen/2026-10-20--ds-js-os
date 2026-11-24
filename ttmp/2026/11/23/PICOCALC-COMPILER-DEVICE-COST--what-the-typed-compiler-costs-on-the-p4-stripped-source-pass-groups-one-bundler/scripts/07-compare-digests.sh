#!/usr/bin/env bash
# The 84-digest harness (12 compile units x 7 arms: image, observed tapes, entries; digests/, copied from
# PICOCALC-RV32-REGISTERS with Files and Agenda as the Typed worlds they are now) on a base compiler and this tree's.
#   07-compare-digests.sh BASE_TAR SCRATCH
# BASE_TAR: `git archive -o BASE_TAR BASE compiler/typed`. SCRATCH receives the base tree, base.json and tree.json.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../../.." && pwd)
tar=$1 scratch=$2
mkdir -p "$scratch/base"
tar -x -C "$scratch/base" -f "$tar"
files() { for f in tape typed-wasm typed-async typed-rv32 typed-rv32-inline typed-rv32-loops typed-rv32-kernel typed-world typed-pie-loops; do [ -e "$1/$f.js" ] && echo "$1/$f.js"; done; }
node "$here/digests/digests.mjs" "$scratch/base.json" $(files "$scratch/base/compiler/typed")
node "$here/digests/digests.mjs" "$scratch/tree.json" $(files "$repo/compiler/typed")
node "$here/digests/digests.mjs" --compare "$scratch/base.json" "$scratch/tree.json"
