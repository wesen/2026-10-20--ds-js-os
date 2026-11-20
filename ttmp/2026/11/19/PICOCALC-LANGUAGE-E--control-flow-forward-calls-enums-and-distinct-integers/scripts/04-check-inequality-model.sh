#!/bin/sh
# Compare the actual emitter and the staged register model for a branching inequality.
set -eu
model=$(find ttmp/2026/11/19 -path '*/PICOCALC-NATIVE-NEXT--*/scripts/02-staged-register-model.mjs')
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
printf '%s\n' 'function f(a: i32, b: i32): i32 { if (!(a === b)) return 7; return 9; }' > "$work/negated.typed"
printf '%s\n' 'function f(a: i32, b: i32): i32 { if (a !== b) return 7; return 9; }' > "$work/inequality.typed"
for kind in negated inequality; do
    STAGE=3 node "$model" --file "$work/$kind.typed" --json > "$work/$kind.json"
done
node --input-type=module - "$work/negated.json" "$work/inequality.json" <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function counts(name) {
    const [row] = Object.values(JSON.parse(readFileSync(name, 'utf8')));
    return {emitted: row.actual, modelA: row.A, modelB: row.B};
}
const negated = counts(process.argv[2]);
const inequality = counts(process.argv[3]);
assert.equal(inequality.modelA, negated.modelA);
assert.equal(inequality.modelB, negated.modelB);
assert.equal(inequality.emitted, negated.emitted - 1);
console.log(JSON.stringify({negated, inequality}));
NODE
