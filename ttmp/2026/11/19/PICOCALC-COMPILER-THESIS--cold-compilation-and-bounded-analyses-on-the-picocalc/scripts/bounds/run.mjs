import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { compiler, referenceFrontend } from './emitter.mjs';
import { analyze } from './proof.mjs';

const modes = ['baseline', 'direct', 'chained'];
const budget = 128;
const worldDir = 'picocalc-os/worlds/';
const text = path => readFileSync(path, 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');
function joinSources(paths) {
    let line = 1;
    const files = [];
    const source = paths.map(path => {
        const unit = text(path);
        files.push({ path, expandedFirstLine: line, sha256: sha256(unit) });
        line += unit.split('\n').length;
        return unit;
    }).join('\n');
    return { source, files };
}
const fileInputs = joinSources([worldDir + 'files/files.typed']);
const agendaInputs = joinSources(['reminder.typed', 'entry.typed'].map(file => worldDir + 'agenda/' + file));
const editorInputs = joinSources(text(worldDir + 'editor/source.list').trim().split(/\s+/)
    .map(file => worldDir + 'editor/' + file));
const { source: files } = fileInputs;
const { source: agenda } = agendaInputs;
const { source: editor } = editorInputs;
const linked = process.argv[2] === '--linked';
if (process.argv.length !== (linked ? 3 : 2)) throw new Error('expected no arguments or --linked');

// The world adapters provide production entry names, the Editor SDK signatures
// and source limit. Intercept their linker call before validation to read them.
function linkContract(path, name) {
    const options = {};
    const ctx = runInNewContext(text(path) + '\n;globalThis', {
        typedWasm: {
            linkWorld(_source, _reactor, entries, imports = [], maxSourceLength) {
                Object.assign(options, { entries, imports, maxSourceLength });
                throw options;
            },
        },
    });
    assert.throws(() => ctx[name]('', null), error => error === options);
    return options;
}

const contracts = {
    Files: { ...linkContract(worldDir + 'files/compile.js', 'compileFiles'), reactor: 'files-reactor.wasm' },
    Agenda: { ...linkContract(worldDir + 'agenda/compile.js', 'compileAgenda'), reactor: 'agenda-reactor.wasm' },
    Editor: { ...linkContract('picocalc-os/compiler/typed-world.js', 'compileTypedWorld'), reactor: 'typed-world-reactor.wasm' },
};

function build(configured, source, { importDefinitions = [], maxSourceLength, runtime, entries } = {}) {
    if (runtime) return configured.linkWorld(source, runtime, entries, importDefinitions, maxSourceLength);
    if (!importDefinitions.length) return configured.compile(source);
    const indexed = Array.from(importDefinitions, (signature, index) => ({ ...signature, index }));
    return configured.compileFunctions(source, indexed.length, indexed, maxSourceLength);
}

function compile(source, mode, { counts = false, limit = budget, ...options } = {}) {
    const traces = [];
    const configured = compiler({
        analyze(name, trace) { traces.push({ name, ...analyze(trace, mode, limit) }); },
        instrumentCounts: counts,
    });
    if (counts && options.runtime) throw new Error('counters operate on standalone modules');
    return { program: build(configured, source, options), traces };
}

function summary(traces, source) {
    const lineAt = offset => source.slice(0, offset).split('\n').length;
    const loops = traces.flatMap(fn => fn.loops);
    const checks = traces.flatMap(fn => fn.checks.map(check => ({ fn: fn.name, ...check })));
    const removed = checks.filter(check => check.removed);
    return {
        functions: traces.length,
        loops: loops.length,
        directGuardLoops: loops.filter(loop => loop.direct).length,
        localUpperGuardLoops: loops.filter(loop => loop.localUpper).length,
        checks: checks.length,
        plainChecks: checks.filter(check => check.plain).length,
        retained: checks.length - removed.length,
        removedBytes: removed.reduce((sum, check) => sum + check.end - check.start, 0),
        queryWork: {
            queries: checks.filter(check => check.work !== undefined).length,
            inspectedEdges: checks.reduce((sum, check) => sum + (check.work ?? 0), 0),
            maxInspectedEdges: Math.max(0, ...checks.map(check => check.work ?? 0)),
            acceptedInspectedEdges: removed.reduce((sum, check) => sum + check.work, 0),
            acceptedMax: Math.max(0, ...removed.map(check => check.work)),
            budgetsReached: checks.filter(check => check.reason === 'budget').length,
        },
        reasons: Object.fromEntries([...new Set(checks.map(check => check.reason ?? 'literal check'))]
            .sort().map(reason => [reason, checks.filter(check => (check.reason ?? 'literal check') === reason).length])),
        witnesses: removed.map(({ fn, at, reason, work, proof }) => ({ fn, line: lineAt(at), reason, work, proof })),
    };
}

const corpus = {};
for (const [name, input] of [['Files', fileInputs], ['Agenda', agendaInputs], ['Editor', editorInputs]]) {
    const { source } = input;
    const { entries, imports, maxSourceLength, reactor } = contracts[name];
    const runtime = linked ? readFileSync('picocalc-os/build/' + reactor) : null;
    const options = { entries, importDefinitions: imports, maxSourceLength, runtime };
    const baseline = compile(source, 'baseline', options);
    const original = build(compiler(), source, options);
    if (baseline.program.bytes) {
        assert.deepEqual(Buffer.from(baseline.program.bytes), Buffer.from(original.bytes));
    } else {
        const normalize = functions => Array.from(functions, fn => ({ name: fn.name, body: Array.from(fn.body) }));
        assert.deepEqual(normalize(baseline.program.functions), normalize(original.functions));
    }
    corpus[name] = {
        sources: input.files,
        scope: linked ? 'linked world Wasm' : name === 'Editor' ? 'typed bodies with placeholder SDK indices' : 'standalone typed Wasm',
        ...(linked ? { reactor, reactorSHA256: sha256(runtime) } : {}),
        ...Object.fromEntries(modes.map(mode => {
            const { program, traces } = mode === 'baseline' ? baseline : compile(source, mode, options);
            if (program.bytes) assert.ok(WebAssembly.validate(program.bytes), name + '.' + mode);
            return [mode, {
                emittedBytes: program.bytes?.length ?? program.functions.reduce((sum, fn) => sum + fn.body.length, 0),
                ...summary(traces, source),
            }];
        })),
    };
}

const fixtures = text(new URL('./fixtures.typed', import.meta.url));
const markdown = text(worldDir + 'editor/markdown.typed');
function sourcePart(first, next) {
    const start = markdown.indexOf('function ' + first + '(');
    const end = markdown.indexOf('function ' + next + '(', start + 1);
    assert.ok(start >= 0 && end > start, 'Editor source-part anchors');
    return markdown.slice(start, end);
}
const marker = sourcePart('editorMdMarker', 'editorMdListEnd');
const markGuard = '    if (start >= end) return 0;';
assert.equal(marker.split(markGuard).length, 2);
const guardedMarker = marker.replace(markGuard, '    if (start < 0 || end > text.length) return 0;\n' + markGuard);
const realEditor = text(worldDir + 'editor/layout.typed') + '\n' +
    sourcePart('editorWhitespace', 'editorMdSuffix') + marker;

const INPUT = 512;
const OUTPUT = 4096;
const RECORD = 8192;
const SECOND = 16384;
const WINDOW = 256;

function invoke(module, test) {
    const wasm = new WebAssembly.Instance(module).exports;
    const data = new DataView(wasm.memory.buffer);
    const dirty = test.initialize ?? (() => {});
    const put = (at, str, capacity = str.length) => {
        data.setUint32(at, capacity, true);
        for (let i = 0; i < str.length; i++) data.setUint16(at + 4 + i * 2, str.charCodeAt(i), true);
    };
    put(INPUT, test.input ?? 'ABC');
    put(SECOND, test.second ?? '');
    put(OUTPUT, '', test.capacity ?? 100);
    data.setInt32(RECORD, 1234, true);
    dirty(data, put);
    let outcome;
    try {
        outcome = { returns: wasm[test.fn](...test.args) };
    } catch (error) {
        if (!(error instanceof WebAssembly.RuntimeError)) throw error;
        outcome = { trap: error.message };
    }
    const snapshot = [INPUT - 4, SECOND, OUTPUT, RECORD].map(addr =>
        Buffer.from(wasm.memory.buffer, addr, WINDOW).toString('hex'));
    const memorySHA256 = sha256(new Uint8Array(wasm.memory.buffer));
    return { ...outcome, snapshot, memorySHA256, checks: wasm.__checks?.value };
}

function scenario(fn, args, expect, more) {
    return { fn, args, expect, ...more };
}

const trap = { trap: 'unreachable' };
const returns = value => ({ returns: value });
const fixturesCases = [
    scenario('longChain', [INPUT, 0, 1, 2, 2, 3, 3], returns(65)),
    scenario('noLower', [INPUT, -1, 3], trap),
    scenario('noUpper', [INPUT, 3, 4], trap),
    scenario('nonStrict', [INPUT, 3, 3], trap),
    scenario('wrongReceiver', [INPUT, SECOND, 1, 3], trap),
    scenario('rebound', [INPUT, SECOND, 1, 3], trap),
    scenario('assigned', [INPUT, 1, 3], trap),
    scenario('loopAssignment', [INPUT], trap),
    scenario('overflow', [INPUT, 3], trap),
    scenario('overflowExpression', [INPUT, 1], trap),
    scenario('recordAlias', [INPUT, 1, 3, INPUT], trap, { memory: [INPUT, 0] }),
    scenario('bufferAlias', [INPUT, 1, 3, INPUT - 4], trap, {
        initialize: data => data.setUint32(INPUT - 4, 1, true), memory: [INPUT, 0],
    }),
    scenario('callAlias', [INPUT, 1, 3, INPUT], trap, { memory: [INPUT, 0] }),
    scenario('callInGuard', [INPUT, 1, 3, INPUT], trap, { memory: [INPUT, 0] }),
    scenario('loopAlias', [INPUT, 3, INPUT], trap, { memory: [INPUT, 0] }),
    scenario('writeOrder', [OUTPUT, 0, 1, RECORD], returns(7), { memory: [RECORD, 0] }),
    scenario('writeOrder', [OUTPUT, 0, 1, OUTPUT], returns(7), { memory: [OUTPUT + 4, 65] }),
    scenario('writeOrder', [OUTPUT, 1, 1, RECORD], returns(7), { memory: [RECORD, 1234] }),
    scenario('trappingWrite', [OUTPUT, 100, RECORD], trap, { memory: [RECORD, 1234] }),
    scenario('rightAnd', [INPUT, -1, 3], returns(0)),
    scenario('rightAnd', [INPUT, 0, 3], returns(1)),
    scenario('rightOr', [INPUT, 3, 3], returns(1)),
    scenario('rightOr', [INPUT, 1, 3], returns(0)),
    scenario('either', [INPUT, 3, 3, 1], trap),
    scenario('either', [INPUT, 3, 3, 0], returns(-1)),
    scenario('twoPaths', [INPUT, 1, 3, 1], trap),
    scenario('twoPaths', [INPUT, 1, 3, 0], returns(66)),
    scenario('literalWrite', [OUTPUT, 99], trap, { memory: [OUTPUT + 4 + 198, 0] }),
    scenario('literalWrite', [OUTPUT, 98], returns(2)),
    scenario('chained', [INPUT, 4], returns(-1)),
    scenario('chained', [INPUT, -1], returns(0)),
    scenario('direct', [65534], { trap: 'memory access out of bounds' }),
];
for (const size of [0, 1, 7, 32, 100]) {
    const input = 'A'.repeat(size);
    fixturesCases.push(
        scenario('direct', [INPUT], returns(size * 65), { input }),
        scenario('chained', [INPUT, size], returns(size * 65), { input }),
        scenario('minimum', [INPUT, size + 1], returns(size * 65), { input }),
    );
}

let random = 0x5da3c007;
function next(bound) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return (random >>> 16) % bound;
}
for (let i = 0; i < 512; i++) {
    const size = next(32);
    const start = next(40) - 4;
    const end = next(40) - 4;
    const input = 'A'.repeat(size);
    fixturesCases.push(
        scenario('rightAnd', [INPUT, start, end], returns(Number(start >= 0 && start < end && end <= size)), { input }),
        scenario('chained', [INPUT, end], returns(end > size ? -1 : Math.max(end, 0) * 65), { input }),
    );
}

const realCases = {
    Files: [
        scenario('filesCompare', [INPUT, 0, SECOND, 0], returns(0), { input: 'common-prefix'.repeat(7), second: 'common-prefix'.repeat(7) }),
        scenario('filesCompare', [INPUT, 0, SECOND, 0], returns(-1), { input: 'notes-a', second: 'notes-b' }),
        scenario('filesCompare', [INPUT, 1, SECOND, 0], returns(-1)),
        scenario('filesName', [INPUT, OUTPUT], returns(7), { input: '   example   ', memory: [OUTPUT + 4, 0x00780065] }),
        scenario('filesName', [INPUT, OUTPUT], returns(-1), { input: '  !' }),
    ],
    Agenda: [
        scenario('skipSpace', [INPUT, 0], returns(3), { input: ' \t a' }),
        scenario('skipSpace', [INPUT, -1], trap),
        scenario('entryWordEnd', [INPUT, 0], returns(6), { input: 'banana split' }),
        scenario('entryWordEnd', [INPUT, 12], returns(12)),
        scenario('normalizeEntry', [INPUT, 20261119, OUTPUT, RECORD], returns(9), { input: 'Buy bread' }),
    ],
    Editor: [
        scenario('editorWrapEnd', [INPUT, 0, 5, 8], returns(5), { input: 'a😀 b' }),
        scenario('editorMdSpace', [INPUT, 0, 5], returns(4), { input: '    b' }),
        scenario('editorMdSpace', [INPUT, -1, 5], trap, { input: '    b' }),
        scenario('editorMdSpace', [INPUT, 0, 6], trap, { input: '     ' }),
        scenario('editorWrapEnd', [INPUT, 0, 2, 8], trap, { input: 'a' }),
    ],
    EditorMarkerContract: [
        scenario('editorMdMarker', [INPUT, 0, 16], returns(11), { input: '1234567890. list' }),
        scenario('editorMdMarker', [INPUT, 7, 15], returns(10), { input: 'prefix 42) item' }),
        scenario('editorMdMarker', [INPUT, 0, 6], returns(1), { input: '- list' }),
        scenario('editorMdMarker', [INPUT, 0, 5], returns(0), { input: '12345' }),
        scenario('editorMdMarker', [INPUT, 0, 4], returns(0), { input: 'text' }),
    ],
};

function behavior(result) {
    const { checks: ignored, ...rest } = result;
    return rest;
}

function replay(name, source, tests, priorSource) {
    const originalBytes = compiler().compile(source).bytes;
    const original = new WebAssembly.Module(originalBytes);
    const prior = priorSource ? new WebAssembly.Module(compiler().compile(priorSource).bytes) : original;
    const variants = Object.fromEntries(modes.map(mode => {
        const counted = compile(source, mode, { counts: true });
        const clean = compile(source, mode);
        if (mode === 'baseline') assert.deepEqual(Buffer.from(clean.program.bytes), Buffer.from(originalBytes));
        return [mode, {
            counted: new WebAssembly.Module(counted.program.bytes),
            clean: new WebAssembly.Module(clean.program.bytes),
            static: summary(clean.traces, source),
        }];
    }));
    const byFunction = {};
    let successfulReturns = 0;
    let trapped = 0;
    for (const test of tests) {
        const expected = invoke(original, test);
        if (priorSource) assert.deepEqual(expected, invoke(prior, test), 'within the stated argument contract');
        const { returns: value, trap: fault } = expected;
        assert.deepEqual(fault === undefined ? { returns: value } : { trap: fault }, test.expect, name + '.' + test.fn);
        if (test.memory) {
            const [address, word] = test.memory;
            const starts = [INPUT - 4, SECOND, OUTPUT, RECORD];
            const window = starts.findIndex(start => address >= start && address < start + WINDOW);
            assert.equal(Buffer.from(expected.snapshot[window], 'hex').readUInt32LE(address - starts[window]), word, test.fn);
        }
        if (fault === undefined) successfulReturns++;
        else trapped++;
        const aggregate = byFunction[test.fn] ??= { cases: 0, baseline: 0, direct: 0, chained: 0 };
        aggregate.cases++;
        for (const mode of modes) {
            const variant = variants[mode];
            const measured = invoke(variant.counted, test);
            const clean = invoke(variant.clean, test);
            assert.deepEqual(behavior(measured), behavior(expected), mode + '.' + test.fn + ' counted');
            assert.deepEqual(behavior(clean), behavior(expected), mode + '.' + test.fn + ' clean');
            aggregate[mode] += measured.checks;
        }
    }
    return {
        cases: tests.length, successfulReturns, trapped,
        executedChecks: Object.fromEntries(modes.map(mode => [mode, Object.values(byFunction)
            .reduce((sum, counts) => sum + counts[mode], 0)])),
        byFunction,
        ...(name === 'fixtures' || priorSource ? { static: Object.fromEntries(modes.map(mode => [mode, variants[mode].static])) } : {}),
    };
}

const dynamic = {
    fixtures: replay('fixtures', fixtures, fixturesCases),
    Files: replay('Files', files, realCases.Files),
    Agenda: replay('Agenda', agenda, realCases.Agenda),
    Editor: replay('Editor', realEditor, realCases.Editor),
    EditorMarkerContract: replay('EditorMarkerContract', guardedMarker, realCases.EditorMarkerContract, marker),
};

const budgets = Object.fromEntries([0, 4, 16, 32, 64, 128].map(limit => {
    const { program, traces } = compile(fixtures, 'chained', { limit, counts: true });
    const result = invoke(new WebAssembly.Module(program.bytes), fixturesCases[0]);
    assert.equal(result.returns, 65);
    const stats = summary(traces, fixtures);
    return [limit, {
        retained: stats.retained, work: stats.queryWork,
        accepted: stats.witnesses.map(site => site.fn),
        longChainExecutedChecks: result.checks,
    }];
}));
assert.equal(budgets[0].retained, dynamic.fixtures.static.baseline.checks);
assert.equal(budgets[32].longChainExecutedChecks, 1);
assert.equal(budgets[64].longChainExecutedChecks, 0);
assert.deepEqual(Buffer.from(compile(fixtures, 'chained', { limit: 0 }).program.bytes),
    Buffer.from(compiler().compile(fixtures).bytes));
assert.deepEqual(dynamic.fixtures.static.chained.witnesses.map(site => site.fn), [
    'direct', 'chained', 'minimum', 'longChain', 'writeOrder', 'rightAnd', 'rightOr',
]);
assert.equal(dynamic.fixtures.byFunction.chained.chained, 0);
assert.equal(dynamic.fixtures.byFunction.chained.baseline, dynamic.fixtures.byFunction.chained.direct);
assert.equal(dynamic.fixtures.byFunction.writeOrder.chained, 0);
assert.equal(dynamic.EditorMarkerContract.static.chained.witnesses.length, 4);
assert.equal(dynamic.EditorMarkerContract.byFunction.editorMdMarker.chained, 0);
assert.ok(dynamic.fixtures.byFunction.recordAlias.chained > 0);
assert.ok(dynamic.fixtures.byFunction.bufferAlias.chained > 0);
assert.ok(dynamic.fixtures.byFunction.callAlias.chained > 0);
assert.ok(dynamic.fixtures.byFunction.callInGuard.chained > 0);
assert.equal(dynamic.fixtures.byFunction.loopAlias.chained, 2);
assert.ok(dynamic.fixtures.byFunction.overflow.chained > 0);

console.log(JSON.stringify({
    node: process.version,
    v8: process.versions.v8,
    compilerSHA256: sha256(referenceFrontend),
    linked,
    workloadSeed: '0x5da3c007',
    budgets,
    corpus,
    dynamic,
}, null, 2));
