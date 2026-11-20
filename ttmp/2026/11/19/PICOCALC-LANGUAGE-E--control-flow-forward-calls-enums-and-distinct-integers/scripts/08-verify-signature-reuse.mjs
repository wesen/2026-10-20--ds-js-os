// The staged variant must move metadata without changing code or diagnostics.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext, runInContext} from 'node:vm';

const [work, elfPath] = process.argv.slice(2);
assert(work && elfPath, 'pass staged compiler directory and typed-world reactor ELF');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = obj => JSON.parse(JSON.stringify(obj));

function load(variant) {
    const realm = createContext();
    const dir = join(work, variant);
    for (const file of ['typed-wasm.js','typed-async.js','typed-rv32.js','typed-world.js'])
        runInContext(readFileSync(join(dir, file), 'utf8'), realm, {filename: file});
    return realm;
}

const stock = load('g4');
const reuse = load('reuse');
const reactor = readFileSync('picocalc-os/build/typed-world-reactor.wasm');
const elf = readFileSync(elfPath);
const editor = readFileSync(join(work, 'g4/editor.typed'), 'utf8');
const typed = String.raw`
record WorldEvent { kind: i32; ask: bool; token: i32; ok: bool; }
record WorldState { result: i32; }
function bridge(state: WorldState): i32 {
    return helper(state) + 2;
}
async function suspend(state: WorldState): i32 {
    const ok = await typedSdkYield();
    if (ok) { state.result = bridge(state); }
    return 0;
}
// } function fake(): i32 {
function helper(state: WorldState): i32 { return 73; }
async function discard(state: WorldState): i32 { return 0; }
function typedWorldMeta(field: i32, output: buffer): i32 {
    output.writeLiteral(0, "} // \" { function fake");
    return field;
}
function typedWorldEvent(event: WorldEvent, state: WorldState, output: buffer, hints: buffer): i32 {
    if (resume()) return 1;
    if (start suspend(state)) return 2;
    return 3;
}
`;

function artifacts(realm, source) {
    const opts = {asyncSource: true};
    const linkedWasm = realm.compileTypedWorld(source, reactor, opts);
    const linkedRv32 = realm.compileTypedWorldRv32(source, elf, opts);
    const raw = realm.typedRv32.compile(source, realm.typedWorld.imports, 96 * 1024, opts);
    const imported = realm.typedWorld.imports.map((fn, i) => ({...fn, index: i + 13}));
    const graph = realm.typedWasm.compileFunctions(source, imported.length + 13, imported, 96 * 1024);
    const metadata = {
        source: linkedWasm.asyncSource, layout: clone(linkedWasm.asyncLayout),
        records: clone(raw.records), signatures: clone(raw.signatures),
        edges: clone(graph.edges), order: clone(graph.order), exports: clone(raw.entries),
        relocations: clone(raw.relocations),
    };
    return {linkedWasm:Buffer.from(linkedWasm), linkedRv32:Buffer.from(linkedRv32), raw:Buffer.from(raw.image), metadata};
}

const output = {};
for (const [name, source] of [['editor', editor], ['interleaved', typed]]) {
    const a = artifacts(stock, source), b = artifacts(reuse, source);
    assert.deepEqual(a, b, name + ' compiler products and graph');
    output[name] = Object.fromEntries(['linkedWasm','linkedRv32','raw'].map(k => [k, {bytes:a[k].length, sha256:sha(a[k])}]));
}
const malformed = [
    typed.replace('return helper(state) + 2', 'return missing(state) + 2'),
    typed.replace('return 73;', 'return true;'),
    typed.replace('return 73;', 'return bridge(state);'),
    typed.replace('function helper(state:', 'function bridge(state:'),
];
function diagnostic(realm, source, native) {
    try {
        if (native) realm.compileTypedWorldRv32(source, elf);
        else realm.compileTypedWorld(source, reactor);
    } catch (error) {
        return error.name + ': ' + error.message;
    }
    throw new Error('expected a compiler diagnostic');
}
output.diagnostics = malformed.map(source => {
    const values = [diagnostic(stock, source, false), diagnostic(stock, source, true)];
    assert.deepEqual(values, [diagnostic(reuse, source, false), diagnostic(reuse, source, true)]);
    return values;
});
console.log(JSON.stringify(output, null, 2));
