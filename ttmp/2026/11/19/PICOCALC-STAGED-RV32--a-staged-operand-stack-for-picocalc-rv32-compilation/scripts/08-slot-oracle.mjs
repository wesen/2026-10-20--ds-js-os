// Exercise the normal Editor compiler/linker against two genuinely assembled reactors.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext, runInContext} from 'node:vm';

const [staged, standardPath, smallPath, output] = process.argv.slice(2);
assert(staged && standardPath && smallPath && output,
    'Usage: node 08-slot-oracle.mjs <staged-directory> <standard-reactor> <small-reactor> <output-directory>');
const source = readFileSync(join(staged, 'sources/editor/app.typed'), 'utf8');
const standard = readFileSync(standardPath);
const small = readFileSync(smallPath);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const compiler = lane => {
    const context = createContext();
    for (const part of ['wasm', 'rv32', 'world']) {
        const file = join(staged, 'lanes', lane, 'typed', `${part}.js`);
        runInContext(readFileSync(file, 'utf8'), context, {filename: file});
    }
    const compile = context.typedRv32.compile;
    const observer = {link: context.compileTypedWorldRv32};
    context.typedRv32.compile = (...args) => {
        const program = compile(...args);
        observer.codeBytes = program.image.length;
        return program;
    };
    return observer;
};

function layout(reactor) {
    const v = new DataView(reactor.buffer, reactor.byteOffset, reactor.byteLength);
    assert.equal(v.getUint32(0, true), 0x464c457f);
    assert.equal(v.getUint16(16, true), 3);
    assert.equal(v.getUint16(18, true), 243);
    const programStart = v.getUint32(28, true);
    const programSize = v.getUint16(42, true);
    const programCount = v.getUint16(44, true);
    assert.equal(programSize, 32);
    const loadSegments = [];
    let slot;
    for (let i = 0; i < programCount; i++) {
        const at = programStart + i * programSize;
        if (v.getUint32(at, true) !== 1) continue;
        const fileOffset = v.getUint32(at + 4, true);
        const virtualAddress = v.getUint32(at + 8, true);
        const fileBytes = v.getUint32(at + 16, true);
        const memoryBytes = v.getUint32(at + 20, true);
        const flags = v.getUint32(at + 24, true);
        loadSegments.push({fileOffset, virtualAddress, fileBytes, memoryBytes, flags});
        if (!(flags & 1)) continue;
        for (let p = (fileOffset + 3) & -4; p + 20 <= fileOffset + fileBytes; p += 4) {
            if (v.getUint32(p, true) !== 0x4147454e || v.getUint32(p + 4, true) !== 0x44415256 ||
                v.getUint32(p + 8, true) !== 0x3332534c) continue;
            assert.equal(slot, undefined, 'slot must be unique');
            const capacity = v.getUint32(p + 12, true);
            const packed = v.getUint32(p + 16, true);
            const exports = packed & 65535, imports = packed >>> 16;
            assert(p + capacity <= fileOffset + fileBytes);
            slot = {fileOffset: p, capacity, exports, imports, headerBytes: 20 + 4 * (exports + imports)};
        }
    }
    assert(slot, 'slot must be in an executable PT_LOAD segment');
    return {imageBytes: reactor.length, sha256: sha(reactor), loadSegments, slot};
}
const standardLayout = layout(standard);
const smallLayout = layout(small);
assert.equal(standardLayout.slot.capacity, 229376);
assert.equal(smallLayout.slot.capacity, 81920);
assert.equal(smallLayout.slot.headerBytes, 140);
const error = {name: 'SyntaxError', message: 'RV32 program does not fit the reactor slot'};
assert.throws(() => compiler('base').link(source, small), error);
assert.throws(() => compiler('fusion').link(source, small), error);
const compile = compiler('staged');
const standardModule = Buffer.from(compile.link(source, standard));
const smallModule = Buffer.from(compile.link(source, small));
assert.deepEqual(smallModule, Buffer.from(compile.link(source, small, {streamFunctions: false})));
assert.equal(standardModule.length - smallModule.length, 144 * 1024);
const {codeBytes} = compile;
assert(Number.isInteger(codeBytes) && codeBytes > 0);
const payload = (module, {slot}) => {
    const start = slot.fileOffset + slot.headerBytes;
    return module.subarray(start, start + codeBytes);
};
assert.deepEqual(payload(smallModule, smallLayout), payload(standardModule, standardLayout));
writeFileSync(join(output, 'editor-standard.elf'), standardModule);
writeFileSync(join(output, 'editor-small.elf'), smallModule);
console.log(JSON.stringify({
    sourceSha256: sha(source), standardReactor: standardLayout, smallReactor: smallLayout,
    codeBytes, codeRoomBytes: smallLayout.slot.capacity - smallLayout.slot.headerBytes,
    remainingBytes: smallLayout.slot.capacity - smallLayout.slot.headerBytes - codeBytes,
    identicalLinkedInstructionBytes: true, oldLanesSmallSlotError: error,
    standardModule: {bytes: standardModule.length, sha256: sha(standardModule)},
    smallModule: {bytes: smallModule.length, sha256: sha(smallModule)},
}, null, 2));
