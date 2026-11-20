// Run from the project root after building files-reactor, agenda-reactor and typed-world-reactor.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createContext, runInContext} from 'node:vm';

const args = process.argv.slice(2);
const [baseline, candidate, candidateSource = candidate] = args.filter(arg => !arg.startsWith('--'));
assert(baseline && candidate, 'usage: node 02-compare-worlds.mjs baseline candidate [candidate-source] [--enum-migration] [--archive=DIR]');
const archive = args.find(arg => arg.startsWith('--archive='))?.slice('--archive='.length);
const compiler = 'picocalc-os/compiler';
const os = 'picocalc-os';
const worlds = os + '/worlds';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function read(rev, path) {
    return rev === 'worktree' ? readFileSync(path, 'utf8')
        : execFileSync('git', ['show', `${rev}:${path}`], {encoding: 'utf8'});
}

function build(compilerRevision, sourceRevision) {
    const ctx = createContext();
    for (const file of ['typed-wasm.js', 'typed-rv32.js', 'typed-world.js', 'typed-async.js']) {
        const path = compiler + '/' + file;
        if (file === 'typed-async.js') {
            const exists = compilerRevision === 'worktree' || execFileSync('git',
                ['ls-tree', compilerRevision, '--', path], {encoding:'utf8'}).trim();
            if (!exists) continue;
            if (compilerRevision === 'worktree' && !existsSync(path)) continue;
        }
        runInContext(read(compilerRevision, path), ctx, {filename:path});
    }
    const imports = ctx.typedWorld?.imports ?? [...read(compilerRevision, compiler + '/typed-world.js')
        .matchAll(/\["(typedSdk\w+)", "([^"]*)", "(\w+)"(?:, true)?\]/g)]
        .map(([, name, params, result]) => ({name, params: params ? params.split(',') : [], result}));
    assert.equal(imports.length, 28);
    const editorSources = read(sourceRevision, worlds + '/editor/source.list').trim().split('\n');
    const apps = {
        editor: {sources: editorSources, imports, max: 96 * 1024, linker: 'compileTypedWorld', reactor: 'typed-world-reactor'},
        files: {sources: ['files.typed'], imports: [], linker: 'compileFiles', reactor: 'files-reactor'},
        agenda: {sources: ['reminder.typed', 'entry.typed'], imports: [], linker: 'compileAgenda', reactor: 'agenda-reactor'},
    };
    const result = {};
    for (const [name, app] of Object.entries(apps)) {
        const dir = worlds + '/' + name;
        if (name !== 'editor') runInContext(read(compilerRevision, dir + '/compile.js'), ctx);
        const source = app.sources.map(file => read(sourceRevision, dir + '/' + file) + '\n').join('');
        const reactor = readFileSync(`${os}/build/${app.reactor}.wasm`);
        const wasm = ctx[app.linker](source, reactor);
        const native = ctx.typedRv32.compile(source, app.imports, app.max);
        const buffered = ctx.typedRv32.compile(source, app.imports, app.max, {streamFunctions:false});
        assert.deepEqual(native.image, buffered.image, name + ' streamed/buffered parity');
        assert.deepEqual(native.relocations, buffered.relocations, name + ' streamed/buffered relocations');
        result[name] = {wasm: Buffer.from(wasm), rv32: Buffer.from(native.image),
            worldStateFields: Object.keys(native.records.WorldState ?? {}).length};
    }
    return result;
}

const before = build(baseline, baseline);
const after = build(candidate, candidateSource);
for (const name of Object.keys(before)) {
    if (name === 'editor' && process.argv.includes('--enum-migration')) {
        assert.equal(after.editor.worldStateFields, 71);
        const change = (after.editor.rv32.length - before.editor.rv32.length) / 4;
        assert(Math.abs(change) <= 40, 'Editor instruction delta exceeded 40: ' + change);
    } else {
        assert.deepEqual(after[name], before[name], name + ' byte parity');
    }
}
if (archive) {
    mkdirSync(archive, {recursive:true});
    for (const [name, app] of Object.entries(before)) {
        for (const target of ['wasm', 'rv32']) {
            writeFileSync(join(archive, name + '.' + target + '.gz'), gzipSync(app[target]));
            if (!app[target].equals(after[name][target]))
                writeFileSync(join(archive, name + '-enum.' + target + '.gz'), gzipSync(after[name][target]));
        }
    }
}

const summary = worlds => Object.fromEntries(Object.entries(worlds).map(([name, app]) => [name, {
    wasmBytes: app.wasm.length, wasmSha256: hash(app.wasm),
    rv32Instructions: app.rv32.length / 4, rv32Sha256: hash(app.rv32), worldStateFields: app.worldStateFields,
}]));
console.log(JSON.stringify({baseline, candidate, candidateSource, before:summary(before), after:summary(after)}, null, 2));
