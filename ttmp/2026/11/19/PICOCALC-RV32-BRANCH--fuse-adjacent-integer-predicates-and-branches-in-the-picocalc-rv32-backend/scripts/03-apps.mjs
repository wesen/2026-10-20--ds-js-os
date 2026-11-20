// Count exact application images or link one matched pair with a shared reactor.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {createContext, runInContext} from 'node:vm';

const read = (path, encoding = 'utf8') => readFileSync(resolve('picocalc-os', path), encoding);
export const lanes = ['baseline', 'candidate'];
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function compiler(pair, lane, app) {
    const context = createContext();
    for (const part of ['wasm', 'rv32', 'world']) {
        const path = resolve(pair, lane, 'typed', part + '.js');
        runInContext(readFileSync(path, 'utf8'), context, {filename: path});
    }
    if (app === 'files' || app === 'agenda') {
        const path = 'worlds/' + app + '/compile.js';
        runInContext(read(path), context, {filename: path});
    }
    return context;
}

function appMetadata() {
    const editorImports = [...read('compiler/typed-world.js').matchAll(/\["(typedSdk\w+)", "([^"]*)", "(\w+)"\]/g)]
        .map(([, name, params, result]) => ({name, params: params ? params.split(',') : [], result}));
    assert.equal(editorImports.length, 28);
    return {
        files: {files: ['files.typed'], entry: 'compileFilesRv32'},
        agenda: {files: ['reminder.typed', 'entry.typed'], entry: 'compileAgendaRv32'},
        editor: {files: read('worlds/editor/source.list').trim().split('\n'),
            entry: 'compileTypedWorldRv32', imports: editorImports, limit: 96 * 1024},
    };
}

function appSource(app, files) {
    const inputs = files.map(file => read('worlds/' + app + '/' + file));
    return app === 'editor' ? inputs.map(text => text + '\n').join('') : inputs.join('\n');
}

function collectWords(program) {
    const branchNames = ['beq', 'bne', null, null, 'blt', 'bge', 'bltu', 'bgeu'];
    const view = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
    const words = view.byteLength / 4;
    const branches = Object.fromEntries(branchNames.filter(Boolean).map(op => [op, 0]));
    const entries = Object.entries(program.entries);
    const functions = {};
    let jal = 0;
    for (const [i, [name, start]] of entries.entries()) {
        const end = entries[i + 1]?.[1] ?? view.byteLength;
        functions[name] = (end - start) / 4;
        assert(Number.isInteger(functions[name]) && functions[name] > 0);
        for (let offset = start; offset < end; offset += 4) {
            const w = view.getUint32(offset, true);
            if ((w & 127) === 0x63) branches[branchNames[(w >>> 12) & 7]]++;
            if ((w & 127) === 0x6f) jal++;
        }
    }
    assert.equal(Object.values(functions).reduce((sum, n) => sum + n, 0), words);
    return {words, codeBytes: view.byteLength, imageSha256: sha(program.image),
        relocations: program.relocations.length, branches, jal, functions};
}

function count(pair, repeats = 31) {
    const result = {revision: '6426798f69c691f5c1979233ebdeb540f8ce7c61',
        node: process.version, warmupPerLane: 10, alternatingPairs: repeats, apps: {}};
    result.lowerers = Object.fromEntries(lanes.map(lane => {
        const bytes = readFileSync(resolve(pair, lane, 'typed/rv32.js'));
        return [lane, {bytes: bytes.length, sha256: sha(bytes)}];
    }));
    for (const [app, {files, imports, limit}] of Object.entries(appMetadata())) {
        const source = appSource(app, files);
        const row = result.apps[app] = {files, sourceSha256: sha(source), sourceBytes: Buffer.byteLength(source)};
        const compile = Object.fromEntries(lanes.map(lane => {
            const {typedRv32} = compiler(pair, lane, app);
            return [lane, options => typedRv32.compile(source, imports, limit, options)];
        }));
        for (const lane of lanes) {
            const stream = compile[lane]();
            const buffered = compile[lane]({streamFunctions: false});
            assert.deepEqual(Buffer.from(stream.image), Buffer.from(buffered.image));
            for (const field of ['entries', 'records', 'relocations', 'signatures', 'importCount']) {
                assert.deepEqual(JSON.parse(JSON.stringify(stream[field])), JSON.parse(JSON.stringify(buffered[field])));
            }
            row[lane] = {...collectWords(stream), compileMs: []};
            for (let i = 0; i < 10; i++) compile[lane]();
        }
        for (let i = 0; i < repeats; i++) {
            for (const lane of i % 2 ? lanes.toReversed() : lanes) {
                const start = performance.now();
                const program = compile[lane]();
                row[lane].compileMs.push(Number((performance.now() - start).toFixed(4)));
                assert.equal(program.image.length, row[lane].codeBytes);
            }
        }
        for (const lane of lanes) {
            const sorted = row[lane].compileMs.toSorted((a, b) => a - b);
            row[lane].medianCompileMs = sorted[Math.floor(repeats / 2)];
        }
        // Fusion retains the conditional and unconditional transfer counts.
        const branchCount = lane => Object.values(row[lane].branches).reduce((a, b) => a + b, 0);
        assert.equal(branchCount('baseline'), branchCount('candidate'));
        assert.equal(row.baseline.jal, row.candidate.jal);
        assert.equal(row.baseline.relocations, row.candidate.relocations);
        assert(row.candidate.words < row.baseline.words, app + ' candidate did not shrink');
    }
    return result;
}

function link(pair, app, reactorPath, destination) {
    const {files, entry} = appMetadata()[app];
    const source = appSource(app, files);
    const reactor = readFileSync(reactorPath);
    const modules = {};
    for (const lane of lanes) {
        const context = compiler(pair, lane, app);
        const bytes = context[entry](source, reactor);
        const buffered = context[entry](source, reactor, {streamFunctions: false});
        assert.deepEqual(Buffer.from(bytes), Buffer.from(buffered));
        writeFileSync(resolve(destination, lane + '.elf'), bytes);
        modules[lane] = {bytes: bytes.length, sha256: sha(bytes)};
    }
    assert.equal(modules.baseline.bytes, modules.candidate.bytes);
    assert.notEqual(modules.baseline.sha256, modules.candidate.sha256);
    return {app, entry, sourceSha256: sha(source), reactorSha256: sha(reactor), modules};
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    const [mode, pair, ...args] = process.argv.slice(2);
    assert(pair && (mode === 'count' || mode === 'link'), 'Usage: 03-apps.mjs count <pair> | link <pair> <app> <reactor> <output>');
    console.log(JSON.stringify(mode === 'count' ? count(pair) : link(pair, ...args), null, 2));
}
