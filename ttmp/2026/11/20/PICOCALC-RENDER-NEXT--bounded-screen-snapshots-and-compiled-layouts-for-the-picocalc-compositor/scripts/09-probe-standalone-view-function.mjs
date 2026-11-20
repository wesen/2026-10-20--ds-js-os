// Host feasibility check on an existing pure leaf function. No world reactor, loader or renderer.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';

const path = 'picocalc-os/worlds/chess/view.typed';
const file = readFileSync(path, 'utf8');
const begin = file.indexOf('function chessPieceGlyph(');
const end = file.indexOf('\nfunction ', begin + 1);
assert(begin >= 0 && end > begin);
const source = file.slice(begin, end).trimEnd() + '\n';
const {bytes} = typedWasm.compile(source);
const second = typedWasm.compile(source);
assert.deepEqual(bytes, second.bytes);
const module = new WebAssembly.Module(bytes);
const imports = WebAssembly.Module.imports(module);
assert.deepEqual(imports, []);
const guest = new WebAssembly.Instance(module, {}).exports;
const expected = 'PNBRQKpnbrqk';
const observed = [...expected].map((_, i) => String.fromCharCode(
    guest.chessPieceGlyph((i < 6 ? 0 : 8) + (i % 6) + 1))).join('');
assert.equal(observed, expected);
console.log(JSON.stringify({input: path, function: 'chessPieceGlyph', sourceBytes: Buffer.byteLength(source),
    moduleBytes: bytes.byteLength, moduleSha256: createHash('sha256').update(bytes).digest('hex'),
    imports, exports: WebAssembly.Module.exports(module), linearMemoryBytes: guest.memory.buffer.byteLength,
    observed, identicalSecondCompilation: true}, null, 2));
