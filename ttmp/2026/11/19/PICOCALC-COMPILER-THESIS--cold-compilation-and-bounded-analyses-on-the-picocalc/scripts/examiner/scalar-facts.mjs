// An examiner-local treatment of the original bounded proof. Run at the repo root.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {analyze} from '../bounds/proof.mjs';
import {compiler} from '../bounds/emitter.mjs';

const read = name => readFileSync(name, 'utf8');
const original = read(new URL('../bounds/proof.mjs', import.meta.url));
const digest = data => createHash('sha256').update(data).digest('hex');
function editOnce(source, before, after) {
    assert.equal(source.split(before).length, 2);
    return source.replace(before, after);
}
let treatment = editOnce(original, "function discard(facts, writes)", [
    "function memoryEffect(facts) {",
    "    return facts.filter(edge => !edge.from.startsWith('l') && !edge.to.startsWith('l'));",
    "}",
    "",
    "function discard(facts, writes)",
].join('\n'));
treatment = editOnce(treatment, 'barrier ? [] : discard(incoming, writes.keys())',
    'discard(barrier ? memoryEffect(incoming) : incoming, writes.keys())');
treatment = editOnce(treatment, 'return expr.barrier ? [] : facts;',
    'return expr.barrier ? memoryEffect(facts) : facts;');
const {analyze: scalarFacts} = await import('data:text/javascript;base64,' + Buffer.from(treatment).toString('base64'));
const signature = {};
assert.throws(() => runInNewContext(read('picocalc-os/compiler/typed-world.js') + '; compileTypedWorld("", null)', {
    typedWasm: {linkWorld(_src, _reactor, _entries, imports, limit) {
        Object.assign(signature, {imports, limit});
        throw signature;
    }},
}), error => error === signature);
function collect(source, proof, mode, opts, standalone = false) {
    const rows = [];
    const c = compiler({analyze(name, trace) {
        const {checks} = proof(trace, mode, 128);
        rows.push(...checks.map(site => ({name, offset: site.at, line: source.slice(0, site.at).split('\n').length,
            removed: !!site.removed, work: site.work ?? 0})));
    }});
    const p = standalone ? c.compile(source) : c.compileFunctions(source, opts.imports.length,
        opts.imports.map((fn,i) => ({...fn,index:i})), opts.limit);
    return {checks: rows.length, sites: rows.filter(s => s.removed).map(s => s.name + '@' + s.line + '#' + s.offset),
        edgeInspections: rows.reduce((sum,s) => sum+s.work, 0), bytes: p.bytes};
}
const apps = {files: ['files.typed'], agenda:['reminder.typed','entry.typed'],
    editor:read('picocalc-os/worlds/editor/source.list').trim().split(/\s+/)};
const corpus = {};
for (const [app, inputs] of Object.entries(apps)) {
    const source = inputs.map(name => read('picocalc-os/worlds/' + app + '/' + name)).join('\n');
    const opts = app === 'editor' ? signature : {imports: [], limit: 65536};
    const rows = {};
    for (const [policy,proof] of [['original',analyze],['scalar',scalarFacts]])
        for (const mode of ['direct','chained']) rows[policy + '_' + mode] = collect(source, proof, mode, opts);
    corpus[app] = {sourceSHA256: digest(source), ...rows};
}
const fixture = `
record Cell { value: i32; }
function clear(c:Cell):i32 { c.value=0; return 1; }
function fresh(s:string,i:i32,c:Cell):i32 {
    if(i<0) return 9;
    clear(c);
    if(i<s.length) return s.charCodeAt(i);
    return 9;
}
function stale(s:string,i:i32,c:Cell):i32 {
    if(i<0 || i>=s.length) return 9;
    clear(c);
    return s.charCodeAt(i);
}
function changed(s:string,start:i32,c:Cell):i32 {
    if(start<0) return 9;
    let i=start;
    let n=0;
    while(n<2) {
        if(n===1 && i<s.length) return s.charCodeAt(i);
        clear(c);
        i=-1;
        n=n+1;
    }
    return 9;
}
`;
function run(bytes, name, index, alias) {
    const {exports} = new WebAssembly.Instance(new WebAssembly.Module(bytes));
    const view = new DataView(exports.memory.buffer);
    view.setUint32(128, 2, true); view.setUint16(132, 65, true); view.setUint16(134, 66, true);
    let result;
    try { result = exports[name](128,index,alias); }
    catch (error) {
        if (!(error instanceof WebAssembly.RuntimeError)) throw error;
        result = error.message;
    }
    return [result, digest(new Uint8Array(exports.memory.buffer))];
}
const clean = compiler().compile(fixture).bytes;
const controls = {};
for (const [policy, proof] of [['original', analyze], ['scalar',scalarFacts]]) {
    const {bytes,...stats} = collect(fixture,proof,'direct',{},true);
    let cases=0, traps=0;
    for (const name of ['fresh','stale','changed']) for (const i of [-1,0,1,2]) for (const receiver of [128,256]) {
        const expected = run(clean,name,i,receiver);
        assert.deepEqual(run(bytes,name,i,receiver),expected);
        cases++;
        if (typeof expected[0] === 'string') traps++;
    }
    controls[policy] = {...stats,cases,traps};
}
assert.equal(controls.scalar.sites.length,1);
assert.match(controls.scalar.sites[0],/^fresh@/);
assert.equal(controls.original.sites.length,0);
console.log(JSON.stringify({node:process.version, originalSHA256:digest(original), treatmentSHA256:digest(treatment),
    controls, corpus},null,2));
