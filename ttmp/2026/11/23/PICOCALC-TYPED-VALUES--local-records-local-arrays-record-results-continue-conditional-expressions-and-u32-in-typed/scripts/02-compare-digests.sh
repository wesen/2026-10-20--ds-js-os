#!/usr/bin/env bash
# Digest the compiler in DIR (a checkout's compiler/typed, e.g. from `git archive BASE compiler/typed`) and the
# working tree's, and compare them.
#   02-compare-digests.sh BASE_DIR SCRATCH
# BASE_DIR/compiler/typed holds the base compiler; SCRATCH receives base.json and tree.json.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../../.." && pwd)
base=$1 scratch=$2
files() { for f in tape typed-wasm typed-async typed-rv32 typed-rv32-inline typed-rv32-loops typed-world typed-pie-loops; do [ -e "$1/$f.js" ] && echo "$1/$f.js"; done; }
[ -s "$scratch/base.json" ] || node "$here/01-digests.mjs" "$scratch/base.json" $(files "$base/compiler/typed")
node "$here/01-digests.mjs" "$scratch/tree.json" $(files "$repo/compiler/typed")
node "$here/01-digests.mjs" --compare "$scratch/base.json" "$scratch/tree.json"
