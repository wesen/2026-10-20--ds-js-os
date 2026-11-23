// The accuracy of compiler/typed/lib/math.typed: each function compiled to WebAssembly (the oracle the RV32 build
// equals bit for bit) and compared with Math.fround of JavaScript's double-precision function, in ulps of the f32
// result, over sampled and edge inputs per domain. Prints the table of compiler/typed/lib/README.md.
//   node compiler/typed/lib/accuracy.mjs [--json]
import {readFileSync} from "node:fs";
import {createContext, runInContext} from "node:vm";

const root = new URL("../../../", import.meta.url);
const ctx = createContext({});
for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js"])
    runInContext(readFileSync(new URL(file, root), "utf8"), ctx, {filename: file});
const source = readFileSync(new URL("compiler/typed/lib/math.typed", root), "utf8");
const lib = (await WebAssembly.instantiate(ctx.typedWasm.compile(source).bytes)).instance.exports;

const F = new Float32Array(1), U = new Int32Array(F.buffer);
const bitsOf = x => { F[0] = x; return U[0]; };
const fromBits = n => { U[0] = n; return F[0]; };
// The distance in ulps between two f32 values: their bits in one ordered integer line (+0 and -0 are one point);
// a NaN against a non-NaN, or infinities that differ, count as Infinity.
const order = x => { const b = bitsOf(x); return b >= 0 ? b : -(b & 0x7fffffff); };
function ulps(got, want) {
    if (Number.isNaN(want) || Number.isNaN(got)) return Number.isNaN(want) && Number.isNaN(got) ? 0 : Infinity;
    if (!Number.isFinite(want) || !Number.isFinite(got)) return got === want ? 0 : Infinity;
    return Math.abs(order(got) - order(want));
}

let seed = 0x1234567;
const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2 ** 32; };
const uniform = (lo, hi) => () => Math.fround(lo + (hi - lo) * next());
// Positive f32 values spread over every binade between 2^lo and 2^hi.
const binades = (lo, hi) => () => Math.fround(2 ** (lo + (hi - lo) * next()));
const N = 200000;

// [name, reference, arity, domains: [label, sampler or [sampler, sampler]], edge inputs]
const fround = Math.fround;
const CASES = [
    ["sinf", Math.sin, 1, [["[-pi, pi]", uniform(-Math.PI, Math.PI)], ["[-100, 100]", uniform(-100, 100)],
        ["[-8192, 8192]", uniform(-8192, 8192)], ["[2^-20, 1)", binades(-20, 0)]],
        [0, -0, 1e-30, Math.PI / 2, Math.PI, 3 * Math.PI / 4, 1e4, -1e4, Infinity, -Infinity, NaN]],
    ["cosf", Math.cos, 1, [["[-pi, pi]", uniform(-Math.PI, Math.PI)], ["[-100, 100]", uniform(-100, 100)],
        ["[-8192, 8192]", uniform(-8192, 8192)]], [0, -0, Math.PI / 2, Math.PI, 1e4, Infinity, NaN]],
    ["tanf", Math.tan, 1, [["[-1.5, 1.5]", uniform(-1.5, 1.5)], ["[-pi/4, pi/4]", uniform(-0.785, 0.785)]], [0, -0, 1, -1]],
    ["expf", Math.exp, 1, [["[-1, 1]", uniform(-1, 1)], ["[-87, 88.7]", uniform(-87, 88.7)],
        ["[-103.9, -87] (subnormal)", uniform(-103.9, -87.4)]], [0, -0, 1, -1, 88.72, 88.73, -103.97, -104, Infinity, -Infinity, NaN]],
    ["exp2f", x => 2 ** x, 1, [["[-1, 1]", uniform(-1, 1)], ["[-126, 127.9]", uniform(-126, 127.9)],
        ["[-149, -126] (subnormal)", uniform(-149, -126)]], [0, 1, -1, 127.99, 128, -150, 0.5, Infinity, -Infinity, NaN]],
    ["logf", Math.log, 1, [["[0.5, 2]", uniform(0.5, 2)], ["2^[-126, 128)", binades(-126, 127.99)],
        ["subnormals", binades(-149, -126)]], [1, 2, 0.5, 0, -0, -1, 1e-45, 3.4028234e38, Infinity, NaN]],
    ["log2f", Math.log2, 1, [["[0.5, 2]", uniform(0.5, 2)], ["2^[-126, 128)", binades(-126, 127.99)],
        ["subnormals", binades(-149, -126)]], [1, 2, 4, 0.5, 0, -1, 1e-45, 3.4028234e38, Infinity, NaN]],
    ["powf", Math.pow, 2, [["x in [0, 1], y in [0.45, 2.2]", [uniform(0, 1), uniform(0.45, 2.2)]],
        ["x in [0.01, 100], y in [-4, 4]", [uniform(0.01, 100), uniform(-4, 4)]],
        ["x in [0.5, 2], y in [-60, 60]", [uniform(0.5, 2), uniform(-60, 60)]]], []],
    ["atanf", Math.atan, 1, [["[-1, 1]", uniform(-1, 1)], ["[-100, 100]", uniform(-100, 100)], ["2^[-30, 30)", binades(-30, 30)]],
        [0, -0, 1, -1, 0.4142135, 2.4142137, 1e30, Infinity, -Infinity, NaN]],
    ["atan2f", Math.atan2, 2, [["y, x in [-10, 10]", [uniform(-10, 10), uniform(-10, 10)]],
        ["y in [-1, 1], x in [-1e-3, 1e-3]", [uniform(-1, 1), uniform(-1e-3, 1e-3)]]], []],
    ["asinf", Math.asin, 1, [["[-1, 1]", uniform(-1, 1)], ["[-0.5, 0.5]", uniform(-0.5, 0.5)], ["(0.99, 1]", uniform(0.99, 1)]],
        [0, -0, 0.5, -0.5, 1, -1, 1.0000001, NaN]],
    ["acosf", Math.acos, 1, [["[-1, 1]", uniform(-1, 1)], ["[-0.5, 0.5]", uniform(-0.5, 0.5)], ["(0.99, 1]", uniform(0.99, 1)],
        ["[-1, -0.99)", uniform(-1, -0.99)]], [0, -0, 0.5, -0.5, 1, -1, 1.0000001, NaN]],
];
// atan2's and pow's edge pairs: signed zeros and infinities on both axes.
const PAIRS = {
    atan2f: [[0, 0], [-0, 0], [0, -0], [-0, -0], [1, 0], [-1, 0], [0, -1], [-0, -1], [1, -0], [Infinity, Infinity],
        [Infinity, -Infinity], [-Infinity, Infinity], [1, Infinity], [1, -Infinity], [Infinity, 1], [NaN, 1], [1, NaN]],
    powf: [[0, 2], [0, 0], [0, -1], [1, 100], [2, 10], [2, -10], [10, 0.5], [0.5, 2.2]],
};

const rows = [];
for (const [name, reference, arity, domains, edges] of CASES) {
    const fn = lib[name];
    const want = args => fround(reference(...args));
    for (const [label, sampler] of domains) {
        let max = 0, sum = 0, worst, absolute = 0;
        for (let i = 0; i < N; i++) {
            const args = arity === 1 ? [sampler()] : [sampler[0](), sampler[1]()];
            const got = fn(...args), w = want(args), e = ulps(got, w);
            sum += e;
            if (e > max) { max = e; worst = args; }
            if (Number.isFinite(w)) absolute = Math.max(absolute, Math.abs(got - reference(...args)));
        }
        rows.push({name, domain: label, samples: N, maxUlp: max, meanUlp: +(sum / N).toFixed(3), maxAbs: absolute, worst});
    }
    const edgeArgs = arity === 1 ? edges.map(x => [fround(x)]) : PAIRS[name].map(p => p.map(fround));
    let max = 0, worst;
    for (const args of edgeArgs) {
        const e = ulps(fn(...args), want(args));
        if (e > max) { max = e; worst = args; }
    }
    rows.push({name, domain: "edges", samples: edgeArgs.length, maxUlp: max, worst});
}
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 1));
else {
    console.log("| Function | Domain | Samples | Max ulp | Mean ulp | Max abs error | Worst input |\n|---|---|---:|---:|---:|---:|---|");
    for (const r of rows)
        console.log(`| \`${r.name}\` | ${r.domain} | ${r.samples} | ${r.maxUlp} | ${r.meanUlp ?? ""} | ${r.maxAbs === undefined ? "" : r.maxAbs.toPrecision(2)} | ${r.worst ? r.worst.map(x => String(x)).join(", ") : ""} |`);
}
