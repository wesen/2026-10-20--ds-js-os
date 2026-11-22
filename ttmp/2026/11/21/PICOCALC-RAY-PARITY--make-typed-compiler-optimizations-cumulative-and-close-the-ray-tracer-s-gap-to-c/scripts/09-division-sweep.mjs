// Compile `n / d` and `n % 2^k` with select.divisions for many constants and compare every
// result with JavaScript's truncating division, under the RV32 interpreter.
// usage: node 09-division-sweep.mjs   (prints a JSON summary; exits non-zero on a mismatch)
import {readFileSync} from "node:fs";
import {runInThisContext} from "node:vm";
const root = new URL("../../../../../../picocalc-os/", import.meta.url);
for (const f of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
    runInThisContext(readFileSync(new URL(f, root), "utf8"), {filename: f});
let seed = 12345;
const random = () => (seed = (Math.imul(seed, 1103515245) + 12345) | 0);
const divisors = new Set([3, 5, 6, 7, 9, 10, 11, 12, 13, 25, 100, 125, 183, 255, 641, 1000, 6700417, 2147483647, 2147483646, 1073741823]);
for (let k = 1; k < 31; k++) divisors.add(1 << k);
while (divisors.size < 300) divisors.add((random() >>> 1) % (divisors.size < 200 ? 70000 : 2147483647) + 2);
const dividends = [0, 1, -1, 2, -2, 3, -3, 2147483647, -2147483648, -2147483647, 1073741824, -1073741824];
for (let i = 0; i < 200; i++) dividends.push(random());
let checked = 0, mismatches = [];
for (const d of divisors) {
    const pow2 = (d & (d - 1)) === 0;
    const src = `function q(n: i32): i32 { return n / ${d}; }\nfunction r(n: i32): i32 { return n % ${pow2 ? d : 2}; }`;
    const program = typedRv32.compile(src, [], undefined, {select: {divisions: true}});
    for (const n of [...dividends, d, -d, d - 1, 1 - d, d + 1]) {
        const n32 = n | 0;
        const want = Math.trunc(n32 / d) | 0, wantR = (n32 % (pow2 ? d : 2)) | 0;
        const got = typedRv32Interp.run(program, "q", [n32], new Uint8Array(16)).result;
        const gotR = typedRv32Interp.run(program, "r", [n32], new Uint8Array(16)).result;
        checked += 2;
        if (got !== want || gotR !== wantR) mismatches.push({d, n: n32, got, want, gotR, wantR});
    }
}
console.log(JSON.stringify({divisors: divisors.size, checked, mismatches: mismatches.slice(0, 10), mismatchCount: mismatches.length}));
process.exit(mismatches.length ? 1 : 0);
