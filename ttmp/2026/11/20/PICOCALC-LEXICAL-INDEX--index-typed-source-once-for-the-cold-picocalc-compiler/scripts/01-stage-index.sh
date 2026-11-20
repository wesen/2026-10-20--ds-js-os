#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 STAGE_DIRECTORY [REVISION]" >&2
  exit 2
fi
stage=$1
revision=${2:-2e4fee1}
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
repo=$(git -C "$script_dir" rev-parse --show-toplevel)
if [[ -e "$stage/picocalc-os/compiler" ]]; then
  echo "stage directory already holds a typed compiler: $stage" >&2
  exit 2
fi
mkdir -p -- "$stage"
git -C "$repo" archive "$revision" picocalc-os/compiler | tar -x -C "$stage"
node "$script_dir/02-index-overlay.mjs" "$stage/picocalc-os/compiler/typed-wasm.js"
printf '%s\n' "$stage/picocalc-os/compiler"
