#!/usr/bin/env bash
set -euo pipefail
out=${1:?new directory}
image=${2:?candidate image}
control=${3:?original headless snapshot}
p=(ttmp/2026/11/18/*CJI-PERF*/scripts)
catalog=(ttmp/2026/11/17/*CJI-PORT*/scripts/07-check-bundled-catalog.py)
mkdir "$out"
trap 'bash "$p/18-headless-smoke.sh" "$out/restored" "$control"' EXIT
sha256sum --check --status "$image/identities.sha256"
bash "$p/18-headless-smoke.sh" "$out/candidate" "$image"
for world in files agenda; do
    python3 "$catalog" --profile-heap 8 --timeout 2000 "$world" > "$out/$world.jsonl" 2> "$out/$world.log"
done
python3 "$(dirname "$0")/verify-native.py" "$out"
