// Independently link every native lane using the actual IDF-built board reactor.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const [work] = process.argv.slice(2);
const staged = path.join(work, 'tree/picocalc-os/port/esp32p4/main');
const bundle = path.join(work, 'build/esp-idf/main');
const reactor = readFileSync(path.join(bundle, 'typed-world-reactor.elf'));
const source = readFileSync(path.join(bundle, 'editor.typed'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = {};
for (const lane of ['original', 'register', 'packed', 'stream']) {
    const ctx = vm.createContext({source: source.toString(), reactor: new Uint8Array(reactor)});
    for (const filename of [path.join(staged, lane + '-wasm.js'), path.join(staged, lane + '-rv32.js'),
                            path.join(work, 'tree/picocalc-os/compiler/typed-world.js')]) {
        vm.runInContext(readFileSync(filename, 'utf8'), ctx, {filename});
    }
    results[lane] = hash(vm.runInContext('compileTypedWorldRv32(source, reactor)', ctx));
}
if (results.packed !== results.register || results.stream !== results.register || results.original === results.register)
    throw Error('unexpected compiler output equivalence classes');
console.log(JSON.stringify({source_sha256:hash(source), reactor_sha256:hash(reactor), results}));
