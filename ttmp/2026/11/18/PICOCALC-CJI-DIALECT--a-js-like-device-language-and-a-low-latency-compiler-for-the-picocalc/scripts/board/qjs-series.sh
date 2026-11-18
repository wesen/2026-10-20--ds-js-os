#!/usr/bin/env bash
set -euo pipefail
src=$(dirname "$0")
p=(ttmp/2026/11/18/*CJI-PERF*/scripts)
out=${1:?new run directory}
image=${2:?headless probe image}
control=${3:?ordinary snapshot}
mkdir "$out"
trap 'bash "$p/18-headless-smoke.sh" "$out/restored" "$control"' EXIT
sha256sum --check --status "$image/identities.sha256"
bash "$p/18-headless-smoke.sh" "$out/probe" "$image"
python3 "$src/run-qjs.py" "$out/probe"
