import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';
import '../../../../../../picocalc-os/compiler/typed-async.js';
import '../../../../../../picocalc-os/compiler/typed-world.js';

const [target, dest, reactorPath = 'picocalc-os/build/typed-world-reactor.wasm'] = process.argv.slice(2);
assert(['wasm', 'rv32'].includes(target) && dest,
    'usage: node 05-prepare-chess.mjs wasm|rv32 output-dir [reactor]');
const os = resolve('picocalc-os');
const workspace = resolve(dest);
const js = join(workspace, 'js');
const worlds = JSON.parse(readFileSync(join(os, 'js/system.json'), 'utf8')).worlds.filter(
    ({name}) => ['keyboard', 'display', 'compositor', 'launcher'].includes(name));
const board = join(os, 'worlds/chess');
const source = readFileSync(join(board, 'source.list'), 'utf8').trim().split('\n')
    .map(name => readFileSync(join(board, name), 'utf8') + '\n').join('');
const reactor = readFileSync(reactorPath);
const bytes = target === 'rv32' ? compileTypedWorldRv32(source, reactor) : compileTypedWorld(source, reactor);
const file = target === 'rv32' ? 'chess.elf' : 'chess.wasm';
for (const path of ['prelude.js', ...worlds.map(world => world.file)]) {
    const copy = join(js, path);
    mkdirSync(dirname(copy), {recursive: true});
    copyFileSync(join(os, 'js', path), copy);
}
worlds.push({name:'chess', file, engine:target === 'rv32' ? 'native' : 'wasm', budget_ms:200, mem_kb:768});
writeFileSync(join(js, file), bytes);
writeFileSync(join(js, 'system.json'), JSON.stringify({worlds}, null, 2) + '\n');
writeFileSync(join(workspace, 'chess.typed'), source);
const digest = input => createHash('sha256').update(input).digest('hex');
console.log(JSON.stringify({sourceBytes:Buffer.byteLength(source), sourceSha256:digest(source),
    target,moduleBytes:bytes.length,moduleSha256:digest(bytes),reactorSha256:digest(reactor)}, null, 2));
