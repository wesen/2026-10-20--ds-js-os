// A callback can produce negative zero from an exact integer.
function negate(x) { return -x; }
const keys = [0, 1].map(negate);
const byKey = new Map();
const distinct = new Set();
for (const key of keys) {
  byKey.set(key, 1);
  distinct.add(key);
}
console.log(1 / [...byKey.keys()][0], 1 / [...distinct][0]);
const rebuilt = new Set(keys);
const entries = keys.map((key) => [key, 7]);
const fromPairs = new Map(entries);
console.log(1 / [...rebuilt][0], 1 / [...fromPairs.keys()][0]);
