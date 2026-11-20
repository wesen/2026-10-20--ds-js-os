// Separate study arm. Apply after the staged native-index lexer, with or without borrowing.
import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
const directory = process.argv[2];
if (!directory) throw new Error("usage: node 14-indexed-prepass-overlay.mjs STAGED_INDEX_COMPILER");
const path = join(directory, "typed-async.js");
let source = readFileSync(path, "utf8");

function replace(before, after) {
    const at = source.indexOf(before);
    if (at < 0 || source.indexOf(before, at + before.length) >= 0)
        throw new Error("compiler anchor changed: " + before.slice(0, 100));
    source = source.slice(0, at) + after + source.slice(at + before.length);
}

replace("function readProgram(source, imported) {", `// Reuse C-produced lexically valid rows. A null body result requests the old
// candidate regexp and token/operator scan, with the same diagnostic precedence.
function indexedBodies(source, lex, signatures) {
    const index = lex.index;
    if (!index) return null;
    const {rows, symbols} = index;
    const known = new Map(signatures.map(fn => [fn.name, fn.index + 1]));
    const marks = new Uint8Array(symbols.length / 3);
    const targets = new Uint32Array(marks.length);
    let paren = -1, dot = -1;
    for (let cell = 0; cell < symbols.length; cell += 3) {
        const kind = symbols[cell + 2];
        if (kind !== 1 && kind !== 4) continue;
        const ordinal = cell / 3;
        const value = source.slice(symbols[cell], symbols[cell + 1]);
        if (kind === 4) {
            if (value === "(") paren = ordinal;
            if (value === ".") dot = ordinal;
            continue;
        }
        targets[ordinal] = known.get(value) ?? 0;
        if (value === "async" || value === "await") marks[ordinal] = 1;
        else if (value === "start" || value === "cancel") marks[ordinal] = 2;
        else if (value === "resume" || value === "pending") marks[ordinal] = 3;
    }
    return sig => {
        if (sig.async) return null;
        const first = lex.findIndexRow(sig.bodyAt);
        const end = (rows[first + 3] - 1) * 4;
        if (rows[first] !== sig.bodyAt || end <= first || rows[end + 1] !== sig.end) return null;
        const calls = [];
        for (let row = first + 4; row < end; row += 4) {
            const ordinal = rows[row + 2];
            const mark = marks[ordinal], target = targets[ordinal];
            if (!mark && !target) continue;
            const next = rows[row + 6], previous = rows[row - 2];
            // Only the predicate for a task form is needed. The parser handles
            // the complete form, its source-gate regexp, and all errors.
            if (mark === 1 || (mark === 2 && symbols[next * 3 + 2] === 1) ||
                (mark === 3 && next === paren)) return null;
            if (target && next === paren && previous !== dot) {
                // E.g. 1helper() has an identifier token but no regexp word
                // boundary. Comment/literal markers influence the legacy scan
                // selection in these invalid bodies, so preserve that path.
                if (rows[row - 3] === rows[row] && symbols[previous * 3 + 2] === 2) return null;
                calls.push(target - 1, rows[row]);
            }
        }
        return calls;
    };
}

function readProgram(source, imported) {`);
replace(`        types.enums, types.distinct, true);
    const functions = new Map();`, `        types.enums, types.distinct, true);
    const inspectBody = indexedBodies(source, lex, signatures);
    const functions = new Map();`);
replace(`        let tokens;
        if (async || candidate.test(source.slice(bodyAt, end))) {`, `        const calls = inspectBody?.(sig) ?? null;
        let tokens;
        if (async || (calls === null && candidate.test(source.slice(bodyAt, end)))) {`);
replace(`        const params = sig.params.map((type, i) => {
            const name = sig.paramNames[i];
            return {type, name, at: sig.paramAts[i], ambient: ambient.get(name) === type};
        });
        functions.set(name, {name, result, start, end, bodyAt, async, index, tokens,
            params, edges: new Set(), waits: [], bindings: [], replacements: []});`,
`        const params = async ? sig.params.map((type, i) => {
            const name = sig.paramNames[i];
            return {type, name, at: sig.paramAts[i], ambient: ambient.get(name) === type};
        }) : null;
        functions.set(name, {name, result, start, end, bodyAt, async, index, tokens, calls, sig,
            params, edges: new Set(), waits: async ? [] : null, bindings: async ? [] : null, replacements: []});`);
if (!source.includes("return {source, types, functions, imports, prefix, signatures,"))
    replace("return {source, types, functions, imports, prefix,",
        "return {source, types, functions, imports, prefix, signatures,");
replace(`        functions.set(fn.name, {name: fn.name, params: fn.params.map(param => param.type), result: fn.result, index: 0});`,
        `        functions.set(fn.name, fn.sig);`);
replace(`        if (!tokens) {
            scanOrdinaryCalls(source, fn, functions);
            continue;
        }`, `        if (!tokens) {
            if (fn.calls === null) {
                scanOrdinaryCalls(source, fn, functions);
            } else {
                for (let i = 0; i < fn.calls.length; i += 2) {
                    const target = functions.get(program.signatures[fn.calls[i]].name);
                    if (target.async)
                        fail(source, fn.calls[i + 1], "call async function " + target.name + " with start or await");
                    fn.edges.add(target);
                }
            }
            continue;
        }`);

writeFileSync(path, source);
