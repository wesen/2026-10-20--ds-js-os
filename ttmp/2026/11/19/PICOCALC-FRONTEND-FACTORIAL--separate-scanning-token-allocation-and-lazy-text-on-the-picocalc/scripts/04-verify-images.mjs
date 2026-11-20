// Verify full linked app bytes, staged compiler bytes and the board backup map.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [work, wasmReactors, backup] = process.argv.slice(2);
const images = ['factorial', 'lazy'];
const sha = data => createHash('sha256').update(data).digest('hex');
const text = path => readFileSync(path, 'utf8');
const json = path => JSON.parse(text(path));
const factory = readFileSync(join(backup, 'factory-original.bin'));
const partition = readFileSync(join(backup, 'partition-table.bin'));
assert.equal(factory.length, 8 * 1024 * 1024);
assert.equal(partition.length, 4096);

const expected = {};
const receipt = {factory: sha(factory), partition: sha(partition), images: {}};
for (const image of images) {
    const path = join(work, image);
    const build = join(path, 'build');
    const reactors = join(build, 'esp-idf/main');
    const os = join(path, 'tree/picocalc-os');
    const firmware = readFileSync(join(build, 'picocalc-os-p4.bin'));
    const map = readFileSync(join(build, 'partition_table/partition-table.bin'));
    assert.ok(Buffer.concat([map, Buffer.alloc(partition.length - map.length, 0xff)]).equals(partition));
    assert(firmware.length > 0 && firmware.length < factory.length);
    const apps = {
        files: [text(join(os, 'worlds/files/files.typed')), 'files-reactor', 'compileFiles'],
        agenda: [['reminder', 'entry'].map(s => text(join(os, 'worlds/agenda', s + '.typed'))).join('\n'),
            'agenda-reactor', 'compileAgenda'],
        editor: [text(join(reactors, 'editor.typed')), 'typed-world-reactor', 'compileTypedWorld'],
    };
    const compilers = json(join(path, 'lanes.json'));
    const oracle = json(join(path, 'oracle.json'));
    const identities = {};
    for (const [lane, pair] of Object.entries(compilers)) {
        const ctx = vm.createContext({});
        for (const [kind, digest] of Object.entries(pair)) {
            const compiler = readFileSync(join(path, 'lanes', lane, 'typed', kind + '.js'));
            assert.equal(sha(compiler), digest);
            assert(firmware.includes(compiler), image + ' ' + lane + ' ' + kind);
            vm.runInContext(compiler.toString(), ctx);
        }
        for (const source of ['compiler/typed-world.js', 'worlds/files/compile.js', 'worlds/agenda/compile.js'])
            vm.runInContext(text(join(os, source)), ctx);
        for (const [app, [source, reactor, entry]] of Object.entries(apps)) {
            const native = readFileSync(join(reactors, reactor + '.elf'));
            const wasm = readFileSync(join(wasmReactors, reactor + '.wasm'));
            const elf = Buffer.from(ctx[entry + 'Rv32'](source, new Uint8Array(native)));
            const buffered = Buffer.from(ctx[entry + 'Rv32'](source, new Uint8Array(native), {streamFunctions: false}));
            const linkedWasm = Buffer.from(ctx[entry](source, new Uint8Array(wasm)));
            assert(elf.equals(buffered), app + ' buffered mismatch');
            assert(WebAssembly.validate(linkedWasm), app + ' Wasm invalid');
            const summary = {sourceSha256: sha(source), sourceBytes: Buffer.byteLength(source),
                nativeReactor: sha(native), wasmReactor: sha(wasm), elf: sha(elf), elfBytes: elf.length,
                wasm: sha(linkedWasm), wasmBytes: linkedWasm.length, words: oracle[lane][app].words};
            if (!expected[app]) expected[app] = {summary, elf, linkedWasm};
            assert.deepEqual(summary, expected[app].summary, image + ' ' + lane + ' ' + app);
            assert(elf.equals(expected[app].elf), app + ' linked ELF mismatch');
            assert(linkedWasm.equals(expected[app].linkedWasm), app + ' linked Wasm mismatch');
            assert.equal(oracle[lane][app].sourceSha256, summary.sourceSha256);
            assert.equal(oracle[lane][app].sha256, summary.elf);
            assert.equal(oracle[lane][app].reactorSha256, summary.nativeReactor);
            identities[app] = summary;
        }
    }
    receipt.images[image] = {firmware: sha(firmware), firmwareBytes: firmware.length, compilers, identities};
}
writeFileSync(join(work, 'verified-images.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
