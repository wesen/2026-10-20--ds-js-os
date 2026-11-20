import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createContext, runInContext} from 'node:vm';

const day = new URL('../../', import.meta.url);
const sibling = (prefix, script) => {
    const [ticket] = readdirSync(day).filter(name => name.startsWith(prefix+'--'));
    return new URL(ticket+'/scripts/'+script, day);
};
const emulator = readFileSync(sibling('PICOCALC-RV32-BRANCH', '07-rv32.mjs'), 'utf8');
const marker = 'else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));';
assert.equal(emulator.split(marker).length, 2);
const extended = emulator.replace(marker, `else if (f3 === 1 && f7 === 0) x[rd] = a << ((w >>> 20) & 31);
            else if (f3 === 2) x[rd] = Number(a < imm);
            else if (f3 === 5 && f7 === 0x20) x[rd] = a >> (imm & 31);
            ${marker}`);
const {runRv32} = await import('data:text/javascript;base64,' + Buffer.from(extended).toString('base64'));
const {walk} = await import(sibling('PICOCALC-STAGED-RV32', '03-historical-model.mjs'));

const [root, reactor, ...variants] = process.argv.slice(2);
assert(root && reactor, 'Usage: 03-verify.mjs <staged-A6-directory> <Editor Wasm reactor>');
const laneNames = variants.length ? variants : ['staged', 'conditions'];
const control = laneNames[0];
assert(laneNames.length > 1, 'compare a control and at least one candidate');
const text = path => readFileSync(path, 'utf8');
const sha = data => createHash('sha256').update(data).digest('hex');
const contexts = Object.fromEntries(laneNames.map(lane => {
    const context = createContext();
    for (const part of ['wasm', 'rv32', 'world']) {
        const path = join(root, 'lanes', lane, 'typed', part+'.js');
        runInContext(text(path), context, {filename: path});
    }
    return [lane, context];
}));

const forms = ['(A && B) || C', 'A && (B || C)', '!(A && B)', '!(A || B)',
    'A && B && C', 'A || B || C', '!(A || !(B && C))', 'A || B && C',
    '(A && B) === C', 'pass(A && B) || C', 'A && bounds(p, s, i)',
    'A || divides(p, d)', 'A || bounds(p, s, i) && divides(p, d)'];
const usages = {
    branch: condition => `if (${condition}) return 1; return 0;`,
    loop: condition => `let n = 0; while (n < 2 && (${condition})) { n = n + 1; } return n;`,
    value: condition => `let flag = ${condition}; if (flag) return 1; return 0;`,
    argument: condition => `if (pass(${condition})) return 1; return 0;`,
};
const source = [
    'record Trace { order: i32; }',
    'function note(p: Trace, id: i32, value: bool): bool { p.order = p.order * 10 + id; return value; }',
    'function pass(value: bool): bool { return value; }',
    'function bounds(p: Trace, s: string, i: i32): bool { note(p, 4, true); return s.charCodeAt(i) === 65; }',
    'function divides(p: Trace, d: i32): bool { note(p, 5, true); return 12 / d > 2; }',
];
const prepared = new Uint8Array(128);
const initial = new DataView(prepared.buffer);
initial.setInt32(48, 1, true);
initial.setUint16(52, 65, true);
const cases = [];
const trap = Symbol('trap');
function predict(expression, usage, a, b, c, i, d) {
    let order = 0, result;
    const note = (id, value) => { order = (Math.imul(order, 10) + id) | 0; return value; };
    const bounds = () => {
        note(4);
        if (i < 0 || i >= 1) throw trap;
        return true;
    };
    const divides = () => {
        note(5);
        if (d === 0) throw trap;
        return Math.trunc(12 / d) > 2;
    };
    const evaluate = new Function('A', 'B', 'C', 'pass', 'bounds', 'divides',
        'return ' + expression.replace(/\b[ABC]\b/g, x=>x+'()'));
    const test = () => evaluate(() => note(1, a), () => note(2, b), () => note(3, c),
        x => x, bounds, divides);
    try {
        if (usage === 'loop') {
            result = 0;
            while (result < 2 && test()) result++;
        } else result = Number(test());
    } catch (err) {
        if (err !== trap) throw err;
        return {order, trap: true};
    }
    return {order, trap: false, result};
}
for (const [form, expression] of forms.entries()) {
    const typed = expression.replace(/\b[ABC]\b/g, c => `note(p, ${c.charCodeAt(0)-64}, ${c.toLowerCase()})`);
    for (const [usage, wrap] of Object.entries(usages)) {
        const name = usage+form;
        source.push(`function ${name}(p:Trace,s:string,a:bool,b:bool,c:bool,i:i32,d:i32):i32 { ${wrap(typed)} }`);
        for (const a of [false, true]) for (const b of [false, true]) for (const c of [false, true]) {
            for (const [i, d] of form < 10 ? [[0, 1]] : [[-1, 0], [0, 0], [0, 1], [0, 6], [1, 2]]) {
                // The JavaScript oracle closes over its own typed pointer arguments.
                const expr = expression.replace('bounds(p, s, i)', 'bounds()').replace('divides(p, d)', 'divides()');
                cases.push({name, args: [32, 48, +a, +b, +c, i, d], expected: predict(expr, usage, a, b, c, i, d)});
            }
        }
    }
}
source.push('function chain(a:bool):i32 { if ('+'a && '.repeat(2048)+'true) return 1; return 0; }');
for (const a of [0, 1]) cases.push({name: 'chain', args: [a], expected: {order: 0, trap: false, result: a}});
const fixture = source.join('\n');
const readOrder = bytes => new DataView(bytes.buffer, bytes.byteOffset).getInt32(32, true);
const witnesses = {};
for (const lane of laneNames) {
    const {typedRv32, typedWasm} = contexts[lane];
    const {instance: {exports: wasm}} = await WebAssembly.instantiate(typedWasm.compile(fixture).bytes);
    const mem = new Uint8Array(wasm.memory.buffer, 0, prepared.length);
    const native = typedRv32.compile(fixture);
    for (const {name, args, expected} of cases) {
        mem.set(prepared);
        let value, trapped = false;
        try { value = wasm[name](...args); }
        catch (error) {
            assert(error instanceof WebAssembly.RuntimeError);
            trapped = true;
        }
        const rv = runRv32(native, name, args, [], {}, prepared);
        const actual = result => ({order: readOrder(result.bytes), trap: result.trap,
            ...(result.trap ? {} : {result: result.result})});
        assert.deepEqual(actual({bytes: mem, trap: trapped, result: value}), expected, lane+' Wasm '+name+' '+args);
        assert.deepEqual(actual(rv), expected, lane+' RV32 '+name+' '+args);
        assert.deepEqual(rv.bytes, mem, lane+' output memory '+name+' '+args);
        if (lane !== control && ['branch10','value10','branch11','value11','branch12','value12'].includes(name)
            && args[3] === 0 && args[4] === 0 && (args[5] === -1 || args[5] === 0 && args[6] === 1))
            ((witnesses[lane] ??= {})[name] ??= []).push({args, ...expected});
    }
}
const malformed = [
    'if (a && 3) return 1;', 'if (a || unknown) return 1;', 'if (a && ) return 1;',
    'if ((a && b) === 2) return 1;', 'if (!(a && b) + 1) return 1;',
    'while ((a && b) || true { a = true; }', 'if (false && missing()) return 1;',
    'if (a && '+'('.repeat(130)+'b'+')'.repeat(130)+') return 1;',
];
const diagnostics = {};
for (const body of malformed) {
    const bad = 'function test(a:bool,b:bool):i32 { '+body+' return 0; }';
    function error(lane, compiler) {
        try { contexts[lane][compiler].compile(bad); }
        catch (err) { return err.name+': '+err.message; }
        assert.fail('bad condition compiled: '+body);
    }
    const want = error(control,'typedWasm');
    for (const lane of laneNames) for (const compiler of ['typedWasm','typedRv32'])
        assert.equal(error(lane, compiler), want);
    diagnostics[body] = want;
}

// A stored logical value, outside a condition, retains its exact Wasm bytes.
const valueOnly = 'function flag(a:bool,b:bool,c:bool):bool { let flag = a && !(b || c); return flag; }';
for (const lane of laneNames.slice(1)) {
    assert.deepEqual(Buffer.from(contexts[control].typedWasm.compile(valueOnly).bytes),
        Buffer.from(contexts[lane].typedWasm.compile(valueOnly).bytes));
}

const imports = [...text(join(root,'lanes',control,'typed/world.js'))
    .matchAll(/\["(typedSdk\w+)", "([^"]*)", "(\w+)"\]/g)]
    .map(([,name,params,result],index) => ({name, params: params ? params.split(',') : [], result, index}));
assert.equal(imports.length, 28);
const limits = {files: [547, 19], agenda: [2611, 26], editor: [16210, 61]};
const accounts = {};
for (const [app, [ceiling, valueIfCeiling]] of Object.entries(limits)) {
    const src = text(join(root, 'sources', app, 'app.typed'));
    const sdk = app === 'editor' ? imports : [];
    const limit = app === 'editor' ? 96*1024 : 64*1024;
    accounts[app] = {sourceSha256: sha(src), ceiling, valueIfCeiling, lanes: {}};
    for (const lane of laneNames) {
        const {typedWasm, typedRv32, compileTypedWorld} = contexts[lane];
        const {functions} = typedWasm.compileFunctions(src, sdk.length, sdk, limit);
        const callables = [...sdk, ...functions];
        const native = typedRv32.compile(src, sdk, limit);
        assert.deepEqual(native, typedRv32.compile(src, sdk, limit, {streamFunctions: false}));
        const functionsAccount = functions.map((fn, i) => {
            const {cost, detail} = walk(fn, callables);
            const end = native.entries[functions[i+1]?.name] ?? native.image.length;
            return {name: fn.name, count: (end-native.entries[fn.name])/4, modelA: cost.A, modelB: cost.B,
                valueIf: detail.shortCircuit};
        });
        const sum = field => functionsAccount.reduce((total,r) => total+r[field],0);
        const count = native.image.length/4, valueIf = sum('valueIf'), modelA = sum('modelA');
        assert.equal(sum('count'), count);
        const wasmBytes = app === 'editor' ? compileTypedWorld(src, readFileSync(reactor)).length : typedWasm.compile(src).bytes.length;
        const rv32Sha256 = sha(native.image);
        const gates = {count: count <= ceiling, valueIf: valueIf <= valueIfCeiling,
            modelA: Math.abs(count-modelA)/modelA <= 0.05, editorWasm: app !== 'editor' || wasmBytes <= 88255};
        accounts[app].lanes[lane] = {count, modelA, modelB: sum('modelB'), valueIf, wasmBytes, rv32Sha256, gates, functionsAccount};
    }
}
console.log(JSON.stringify({node: process.version, comparisons: cases.length*laneNames.length*2,
    cases: cases.length, traps: cases.filter(x=>x.expected.trap).length, diagnostics, accounts, witnesses}, null, 2));
