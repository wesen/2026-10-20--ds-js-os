// Per-pass compile time of the five workloads on host Node, from typedRv32.compile's `timing` rows.
//
//   node 03-pass-timing.mjs [--rounds N] [--write-sources DIR] [--json OUT] FILE...
//
// FILEs are the compiler's scripts in load order. Each workload compiles under the policy the P4 uses for
// it and again under "kernel" (every pass). Each (workload, policy) runs in a fresh realm: two warm-up
// compiles, then N timed ones (default 7); the table gives the median per pass. --write-sources writes
// each unit's source to DIR/NAME.typed for the bare-QuickJS harness (04-qjs-pass-timing.c).
import {readFileSync, writeFileSync} from "node:fs";
import {runInContext} from "node:vm";
import {realm, units} from "./units.mjs";

export const WORKLOADS = [
    ["agenda", "interactive"], ["editor", "interactive"], ["files", "default"], ["playableChess", "balanced"],
    ["ray", "kernel"], ["agenda", "kernel"], ["editor", "kernel"], ["files", "kernel"], ["playableChess", "kernel"],
];
const args = process.argv.slice(2);
const option = name => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args.splice(at, 2)[1];
};
const rounds = Number(option("--rounds") ?? 7);
const sources = option("--write-sources");
const json = option("--json");
const files = args;
const driver = readFileSync(new URL("./pass-totals.js", import.meta.url), "utf8");
const median = values => values.slice().sort((a, b) => a - b)[values.length >> 1];
const all = units(realm(files).typedWorld.imports);
if (sources) for (const [name] of WORKLOADS) writeFileSync(sources + "/" + name + ".typed", all[name][0]);
const table = [];
for (const [name, policy] of WORKLOADS) {
    const ctx = realm(files);
    ctx.SOURCE = all[name][0];
    ctx.POLICY = policy;
    ctx.WORLD = all[name][1].length > 0;
    const runs = [];
    for (let i = 0; i < rounds + 2; i++) runs.push(JSON.parse(runInContext(driver, ctx)));
    const timed = runs.slice(2);
    const passes = [...new Set(timed.flatMap(run => Object.keys(run.totals)))];
    const row = {workload: name, policy, bytes: timed[0].bytes, passes: {}};
    for (const pass of passes) row.passes[pass] = {ms: median(timed.map(run => run.totals[pass]?.ms ?? 0)),
        runs: timed[0].totals[pass]?.runs ?? 0};
    table.push(row);
    process.stderr.write(name + "/" + policy + " ");
}
process.stderr.write("\n");
if (json) writeFileSync(json, JSON.stringify(table, null, 1) + "\n");
const order = ["frontend", "storeless", "inline", "guarded", "pie", "commute", "conjunctions", "sets", "rotate", "ranges",
    "version", "split", "facts", "leaf", "plan", "emit", "candidate", "compile"];
const columns = order.filter(pass => table.some(row => row.passes[pass]));
console.log("| Workload, policy | " + columns.join(" | ") + " |");
console.log("|---|" + columns.map(() => "---:").join("|") + "|");
for (const row of table)
    console.log("| " + row.workload + ", " + row.policy + " | " +
        columns.map(pass => row.passes[pass] ? row.passes[pass].ms.toFixed(1) : "").join(" | ") + " |");
