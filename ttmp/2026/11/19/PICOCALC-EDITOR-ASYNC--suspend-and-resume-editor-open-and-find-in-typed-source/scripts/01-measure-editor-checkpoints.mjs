import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-async.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';
import '../../../../../../picocalc-os/compiler/typed-world.js';

const sourceDirectory = 'picocalc-os/worlds/editor';
const reactor = readFileSync('picocalc-os/build/typed-world-reactor.wasm');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const requestedRefs = process.argv.slice(2);
for (const ref of requestedRefs.length ? requestedRefs : ['worktree']) {
    const read = file => ref === 'worktree' ? readFileSync(sourceDirectory + '/' + file, 'utf8') :
        execFileSync('git', ['show', ref + ':' + sourceDirectory + '/' + file], {encoding:'utf8'});
    const source = read('source.list').trim().split('\n').map(file => read(file) + '\n').join('');
    const wasm = compileTypedWorld(source, reactor);
    const rv32 = typedRv32.compile(source, typedWorld.imports, 96 * 1024);
    console.log(JSON.stringify({
        ref,
        stateFields:Object.keys(rv32.records.WorldState).length,
        wasmBytes:wasm.length,
        wasmSHA256:hash(wasm),
        rv32Instructions:rv32.image.length / 4,
        rv32SHA256:hash(rv32.image),
        editorEntryLines:read('editor.typed').trimEnd().split('\n').length,
        ...(rv32.asyncLayout && {asyncLayout:rv32.asyncLayout}),
    }));
}
