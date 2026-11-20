#!/usr/bin/env bash
# Run from the repository root with Node 22+ and the Acorn parser installed.
set -euo pipefail
dir=$(cd "$(dirname "$0")" && pwd)
lab=(ttmp/2026/11/20/PICOCALC-RENDER-LAB--*/scripts/04-screen-oracle.mjs)
sha256sum -c "$dir/../various/frozen-inputs.sha256"
# The Keys driver was repaired after the initial freeze (missing ask/now). Verify
# the original extractor, runtime, System execution, corpus and Keys source here.
rg -v '11-keys-holdout.cjs' "$dir/../various/extractor-freeze.sha256" | sha256sum -c
sha256sum -c "$dir/../various/keys-driver-repair.sha256"
node "$dir/04-harness.cjs"
node "$dir/07-manual-study.cjs"
node "$dir/10-auto-study.cjs"
node "$dir/11-keys-holdout.cjs"
for arm in sysmon-generic sysmon-manual sysmon-auto keys-generic keys-auto; do
  node "${lab[0]}" "$dir/../various/$arm.ndjson" "/tmp/render-system-$arm" --skip-frame 1
done
node "$dir/13-comparisons.cjs"
"$dir/15-heap.sh"
node "$dir/16-protocol-audit.cjs"
node "$dir/22-paired-diff.cjs"
"$dir/23-source-cost.sh"
node "$dir/24-keys-normalization.cjs"
node "${lab[0]}" "$dir/../various/keys-manual-posthoc.ndjson" /tmp/render-system-keys-manual --skip-frame 1
diff -qr /tmp/render-system-keys-generic /tmp/render-system-keys-manual
