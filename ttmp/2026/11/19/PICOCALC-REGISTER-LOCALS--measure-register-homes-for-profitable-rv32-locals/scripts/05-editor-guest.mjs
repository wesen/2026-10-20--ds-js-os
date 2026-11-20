// Preserve the exact full Editor text so offsets and intra-app calls are identical.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {appendFileSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext, runInContext} from 'node:vm';

const [work, a7] = process.argv.slice(2);
assert(work && a7, 'pass board work and A7 stage directories');
const main = join(work, 'tree/picocalc-os/port/esp32p4/main');
const names = Object.keys(JSON.parse(readFileSync(join(work, 'lanes.json'))));
const source = readFileSync(join(a7, 'sources/editor/app.typed'), 'utf8');
const world = readFileSync(join(a7, 'lanes/a6/typed/world.js'), 'utf8');
const imports = [...world.matchAll(/\["(typedSdk\w+)", "([^"]*)", "(\w+)"\]/g)]
    .map(([, name, params, result], index) => ({name, params: params ? params.split(',') : [], result, index}));
assert.equal(imports.length, 28);
const assembly = ['.section .text.lab_guest,"ax",@progbits', '.option push', '.option norvc', '.option norelax'];
const header = ['#pragma once'];
const receipt = {};
for (const [index, lane] of names.entries()) {
    const ctx = createContext();
    for (const file of ['wasm', 'rv32'])
        runInContext(readFileSync(join(work,'lanes',lane,'typed',file+'.js'),'utf8'),ctx);
    const program = ctx.typedRv32.compile(source, imports, 96*1024);
    const image = Buffer.from(program.image);
    const offsets = Object.entries(program.entries);
    const namesAt = new Map(offsets.map(([name, start]) => [start,name]));
    const relocations = new Set(program.relocations.map(({offset}) => offset));
    const reachable = new Set();

    function visit(name) {
        if (reachable.has(name)) return;
        reachable.add(name);
        const n = offsets.findIndex(([symbol]) => symbol === name);
        assert(n >= 0, 'guest call must target a compiled function');
        const start = offsets[n][1], end = offsets[n+1]?.[1] ?? image.length;
        for (let at = start; at < end; at += 4) {
            assert(!relocations.has(at), 'guest operation must not call the reactor');
            const word = image.readUInt32LE(at);
            if ((word & 0xfff) === 0xef) {
                const delta = ((word >> 31) << 20) | (word & 0xff000) |
                    (((word >>> 20) & 1) << 11) | ((word >>> 20) & 0x7fe);
                visit(namesAt.get(at+delta));
            }
        }
    }
    const functionName = 'editorFindMatch';
    visit(functionName);
    assert.equal(program.signatures.find(fn=>fn.name===functionName).params.join(','), 'string,i32,i32,buffer,i32');
    assert.equal(program.signatures.find(fn=>fn.name===functionName).result, 'bool');
    const label = 'editor'+index;
    const entry = program.entries[functionName];
    assembly.push('.balign 4');
    for (let at = 0; at < image.length; at += 4) {
        if (at === entry) assembly.push('.global '+label, '.type '+label+', @function',label+':');
        assembly.push('.long 0x'+image.readUInt32LE(at).toString(16));
    }
    header.push('extern int '+label+'(const void *, int, int, const void *, int);');
    receipt[lane] = {reachable: [...reachable], entry, words: image.length/4,
        sha256: createHash('sha256').update(image).digest('hex')};
    writeFileSync(join(work, 'editor-guest-'+lane+'.bin'),image);
}
header.push('static int (*const searches[])(const void *, int, int, const void *, int) = {'+
    names.map((_,i)=>'editor'+i).join(',')+'};');
appendFileSync(join(main,'lab_guest.S'), [...assembly,'.option pop',''].join('\n'));
writeFileSync(join(main,'lab_editor_guest.h'),header.join('\n')+'\n');
writeFileSync(join(work,'guest-editor.json'),JSON.stringify(receipt,null,2)+'\n');
