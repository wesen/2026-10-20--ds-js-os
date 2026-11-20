#!/usr/bin/env bash
set -euo pipefail
work=$1
idf=$2
lane=${3:-native-index}
shift "$(( $# >= 3 ? 3 : 2 ))"
root=$(git rev-parse --show-toplevel)
scripts=$(cd "$(dirname "$0")" && pwd)
qualification=("$root"/ttmp/2026/11/19/PICOCALC-EG-QUAL--*/scripts)
mkdir -p "$work/$lane"
git clone --quiet --local --no-checkout "$root" "$work/$lane/checkout"
git -C "$work/$lane/checkout" checkout --quiet --detach 2e4fee1
python3 -B "$scripts/06-stage-firmware.py" "$work/$lane/checkout" "$@" > "$work/$lane/staged.json"
bash "${qualification[0]}/02-prepare-images.sh" "$work" 2e4fee1 "$idf" "$lane"
python3 -B "${qualification[0]}/09-fixed-wall-images.py" "$work/$lane" "$idf"
