// Usage from repo root: node 03-qualify.mjs OVERLAYS REACTORS SOURCES training|held-out
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

export const revision = '40bcf850a5809ef6d839127869faa952596ed157';
export const policies = ['control', 'always', 'select'];
export const sha = data => createHash('sha256').update(data).digest('hex');
const now = () => performance.now() * 1e6;

export function realm(overlays, policy) {
    const context = vm.createContext({});
    const names = ['typed/wasm.js', 'typed/rv32.js', 'typed/world.js', 'files/compile.js', 'agenda/compile.js'];
    for (const name of names) {
        vm.runInContext(readFileSync(join(overlays, policy, name), 'utf8'), context, {filename:name});
    }
    return context;
}

function imageWords(data) {
    const words = Buffer.from(data);
    const counts = {div:0, rem:0, traps:0, words:words.length / 4};
    for (let i = 0; i < words.length; i += 4) {
        const word = words.readUInt32LE(i);
        if ((word & 0xfe00707f) === 0x02004033) counts.div++;
        if ((word & 0xfe00707f) === 0x02006033) counts.rem++;
        if (word === 0x00100073) counts.traps++;
    }
    return counts;
}

export function collect(program) {
    const {image, ...metadata} = program;
    const entries = Object.entries(program.entries);
    const functions = Object.fromEntries(entries.map(([name, start], i) => [
        name, imageWords(image.subarray(start, entries[i + 1]?.[1] ?? image.length)),
    ]));
    return {raw: sha(image), metadata: sha(JSON.stringify(metadata)), ...imageWords(image), functions};
}

function applications(sources, which) {
    const read = name => readFileSync(join(sources, name + '.typed'), 'utf8');
    if (which === 'training') return {
        files: [read('files'), 'files-reactor.elf', 'compileFilesRv32'],
        agenda: [read('agenda'), 'agenda-reactor.elf', 'compileAgendaRv32'],
    };
    assert.equal(which, 'held-out', 'separate training and held-out invocation');
    return {editor: [read('editor'), 'typed-world-reactor.elf', 'compileTypedWorldRv32']};
}

function profile(overlays, policy, app, reactor) {
    const [source,, entry] = app;
    const context = realm(overlays, policy);
    const bytes = new Uint8Array(reactor);
    const stats = [];
    const options = {observeFacts: stat => stats.push(stat), factClock: now};
    const compile = context.typedRv32.compile;
    let program;
    context.typedRv32.compile = (...args) => (program = compile(...args));
    const linked = context[entry](source, bytes, options);
    assert.deepEqual(Buffer.from(bytes), reactor);
    const raw = collect(program);
    const unobserved = context[entry](source, bytes);
    assert.deepEqual(Buffer.from(linked), Buffer.from(unobserved));
    assert.equal(raw.raw, sha(program.image));
    const buffered = context[entry](source, bytes, {streamFunctions:false});
    assert.deepEqual(Buffer.from(linked), Buffer.from(buffered));
    assert.equal(raw.raw, sha(program.image));
    return {
        ...raw,
        sha256:sha(linked), bytes:linked.length, stats,
        admitted:stats.filter(r => r.admitted).length,
        candidates:stats.filter(r => r.candidate).length,
        chargedCells:stats.reduce((a, r) => a + r.chargedCells, 0),
        peakScratchBytes:Math.max(0, ...stats.map(r => r.scratchBytes)),
        analysisNs:Math.round(stats.reduce((a, r) => a + r.analysisNs, 0)),
        removedZero:stats.reduce((a, r) => a + r.removedZero, 0),
        removedOverflow:stats.reduce((a, r) => a + r.removedOverflow, 0),
        localProofs:stats.reduce((a, r) => a + r.localProofs, 0),
    };
}

function validate(lanes) {
    const base = lanes.control;
    for (const [policy, lane] of Object.entries(lanes)) {
        assert.equal(base.div, lane.div);
        assert.equal(base.rem, lane.rem);
        assert.equal(base.traps - lane.traps, lane.removedZero + lane.removedOverflow);
        assert.equal(base.words - lane.words, 2 * lane.removedZero + 7 * lane.removedOverflow);
        for (const stat of lane.stats) {
            const from = base.functions[stat.name], to = lane.functions[stat.name];
            assert.equal(stat.candidate, Boolean(from.div + from.rem), stat.name);
            assert.equal(stat.usedProofs, stat.removedZero, stat.name);
            assert.equal(from.words - to.words, 2 * stat.removedZero + 7 * stat.removedOverflow, stat.name);
            assert.equal(stat.chargedCells, stat.admitted ? 2 * stat.cells : 0, stat.name);
            if (stat.admitted) assert.ok(stat.cells <= 2048, stat.name);
            if (policy === 'select' && stat.admitted) assert.ok(stat.candidate, stat.name);
        }
        if (policy === 'select') assert.ok(lane.chargedCells <= 32768);
        if (!lane.removedZero) {
            assert.equal(lane.sha256, base.sha256);
            assert.equal(lane.raw, base.raw);
            assert.equal(lane.metadata, base.metadata);
        }
    }
}

function time(overlays, output, app, reactor) {
    const order = [
        ['control', 'always', 'select'], ['always', 'select', 'control'], ['select', 'control', 'always'],
        ['select', 'always', 'control'], ['control', 'select', 'always'], ['always', 'control', 'select'],
    ];
    return [...order, ...order].map((block, i) => block.map((policy, position) => {
        const start = now();
        const context = realm(overlays, policy);
        const linked = context[app[2]](app[0], new Uint8Array(reactor));
        const elapsedNs = Math.round(now() - start);
        assert.equal(sha(linked), output[policy].sha256);
        return {block:i, position, policy, elapsedNs};
    }));
}

function main() {
    const [overlays, reactors, fixtures, which] = process.argv.slice(2);
    assert.ok(overlays && reactors && fixtures && which);
    const apps = applications(fixtures, which);
    const sources = {}, outputs = {}, samples = {};
    for (const [name, app] of Object.entries(apps)) {
        const [source, filename] = app;
        const reactor = readFileSync(join(reactors, filename));
        if (name === 'editor') assert.equal(source, readFileSync(join(reactors, 'editor.typed'), 'utf8'));
        sources[name] = {sourceSha256:sha(source), sourceBytes:Buffer.byteLength(source), reactorSha256:sha(reactor)};
        outputs[name] = Object.fromEntries(policies.map(policy => [policy, profile(overlays, policy, app, reactor)]));
        validate(outputs[name]);
        samples[name] = time(overlays, outputs[name], app, reactor);
    }
    console.log(JSON.stringify({revision, which, sources, outputs, samples}, null, 2));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
