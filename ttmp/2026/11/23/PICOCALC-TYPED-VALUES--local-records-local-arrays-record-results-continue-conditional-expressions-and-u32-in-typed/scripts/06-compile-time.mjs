// Host compile time of the boot worlds, a base compiler against the working tree's: the median of interleaved runs
// in two node:vm realms. A proxy for the P4's boot compile (QuickJS there, V8 here), to see whether the front end's
// new checks cost anything on programs that do not use the new features.
//
//   node 06-compile-time.mjs BASE_DIR [RUNS [TREE_DIR]]    BASE_DIR/compiler/typed holds the base compiler (git archive)
import {realm, root, units} from "./units.mjs";

const files = dir => ["tape", "typed-wasm", "typed-async", "typed-rv32", "typed-rv32-inline", "typed-rv32-loops", "typed-world"]
    .map(name => dir + "/compiler/typed/" + name + ".js");
const base = realm(files(process.argv[2]));
// TREE_DIR (optional) replaces the working tree: the base twice is an A/A check of the method.
const tree = realm(files(process.argv[4] ?? new URL(".", root).pathname.replace(/\/$/, "")));
const runs = Number(process.argv[3] ?? 15);
const all = units(tree.typedWorld.imports);
const median = xs => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
for (const [unit, policy] of [["agenda", "interactive"], ["editor", "interactive"], ["files", "interactive"],
    ["playableChess", "balanced"], ["ray", "kernel"]]) {
    const [source, imports] = all[unit];
    const times = {base: [], tree: []};
    // The order alternates, so neither realm always runs second (after the other's garbage).
    const pairs = [[["base", base], ["tree", tree]], [["tree", tree], ["base", base]]];
    for (let i = 0; i < runs + 2; i++) for (const [name, ctx] of pairs[i & 1]) {
        const start = performance.now();
        ctx.typedRv32.compile(source, imports, 1 << 20, {policy});
        if (i >= 2) times[name].push(performance.now() - start);
    }
    const b = median(times.base), t = median(times.tree);
    console.log(unit.padEnd(14), policy.padEnd(12), "base", b.toFixed(2), "ms", "tree", t.toFixed(2), "ms",
        ((t / b - 1) * 100).toFixed(1) + "%");
}
