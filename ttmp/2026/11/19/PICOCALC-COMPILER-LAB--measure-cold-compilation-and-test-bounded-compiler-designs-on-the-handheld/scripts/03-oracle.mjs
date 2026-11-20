// Build the host identity oracle and assemble exact guest text for the timing fixture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [work, mode] = process.argv.slice(2);
const names = Object.keys(JSON.parse(readFileSync(join(work, 'lanes.json'))));
const os = join(work, 'tree/picocalc-os');
const build = join(work, 'build/esp-idf/main');
const main = join(os, 'port/esp32p4/main');
const text = path => readFileSync(path, 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const guest = mode === '--guest';
const firmware = guest ? null : readFileSync(join(work, 'build/picocalc-os-p4.bin'));
const apps = {
    files: [text(join(os,'worlds/files/files.typed')), 'files-reactor.elf', 'compileFilesRv32', 'filesCompare'],
    agenda: [['reminder', 'entry'].map(s => text(join(os, 'worlds/agenda', s+'.typed'))).join('\n'),
        'agenda-reactor.elf', 'compileAgendaRv32', 'entryWeekday']
};
if (!guest) apps.editor = [text(join(build, 'editor.typed')), 'typed-world-reactor.elf', 'compileTypedWorldRv32'];
const result = {};
const assembly = ['.section .text.lab_guest,"ax",@progbits', '.option push', '.option norvc', '.option norelax'];
const header = ['#pragma once', '#define LANES '+names.length];
for (const [i, lane] of names.entries()) {
    const ctx = vm.createContext({});
    for (const file of ['wasm','rv32'])
        vm.runInContext(text(join(work,'lanes',lane,'typed',file+'.js')), ctx);
    for (const file of ['compiler/typed-world.js','worlds/files/compile.js','worlds/agenda/compile.js'])
        vm.runInContext(text(join(os, file)), ctx);
    result[lane] = {};
    for (const [app, [src, reactor, entry, symbol]] of Object.entries(apps)) {
        if (guest) {
            // Keeping the full position-independent app text preserves calls between guest functions.
            const program = ctx.typedRv32.compile(src);
            assert.equal(program.relocations.length, 0);
            const sig = program.signatures.find(f => f.name === symbol);
            assert.equal(sig.params.join(','), app === 'files' ? 'string,bool,string,bool' : 'i32');
            assert.equal(sig.result, 'i32');
            const image = Buffer.from(program.image);
            const entryOffset = program.entries[symbol];
            assert(Number.isInteger(entryOffset) && entryOffset % 4 === 0 && entryOffset >= 0 && entryOffset < image.length);
            const label = app+i;
            assembly.push('.balign 4');
            for (let k = 0; k < image.length; k += 4) {
                if (k === entryOffset) assembly.push('.global '+label, '.type '+label+', @function',label+':');
                assembly.push('.long 0x'+image.readUInt32LE(k).toString(16));
            }
            header.push(app==='files' ? 'extern int '+label+'(const files_string *, bool, const files_string *, bool);'
                : 'extern int '+label+'(int);');
            result[lane][app] = {sourceSha256: sha(src), words: image.length / 4, raw: sha(image), entryOffset};
        } else {
            let raw;
            const compile = ctx.typedRv32.compile;
            ctx.typedRv32.compile = (...args) => (raw=compile(...args));
            const runtime=readFileSync(join(build,reactor));
            const bytes=ctx[entry](src,new Uint8Array(runtime));
            assert(raw?.image?.length);
            result[lane][app] = {sourceSha256:sha(src), reactorSha256:sha(runtime), sha256:sha(bytes),
                bytes:bytes.length, raw:sha(raw.image), words:raw.image.length/4};
            if (app !== 'editor') {
                const offset=firmware.indexOf(Buffer.from(raw.image));
                assert(offset >= 0, 'the guest timing code must occur verbatim in the physical firmware');
                result[lane][app].guestFirmwareOffset=offset;
            }
            ctx.typedRv32.compile=compile;
        }
    }
}
if (guest) {
    for (const [array,values] of [['names', names],['fronts',names.map(x=>'exp/'+x+'/wasm.js')],['backs',names.map(x=>'exp/'+x+'/rv32.js')]])
        header.push('static const char *const '+array+'[] = {'+values.map(x=>JSON.stringify(x)).join(',')+'};');
    header.push('static int (*const comparisons[])(const files_string *, bool, const files_string *, bool) = {'+
        names.map((_,i)=>'files'+i).join(',')+'};');
    header.push('static int (*const weekdays[])(int) = {'+names.map((_,i)=>'agenda'+i).join(',')+'};');
    const dates = [19990101,19991231,20000229,20000301,20240229,20241231,21000301,21001231];
    const weekdays = dates.map(d=>new Date(Date.UTC(Math.floor(d/10000),Math.floor(d/100)%100-1,d%100)).getUTCDay());
    header.push('static const int dates[] = {'+dates.join(',')+'}, expected_days[] = {'+weekdays.join(',')+'};');
    writeFileSync(join(main, 'lab_guest.S'), [...assembly,'.option pop',''].join('\n'));
    writeFileSync(join(main, 'lab_guest.h'), [...header,''].join('\n'));
}
writeFileSync(join(work,guest ? 'guest.json' : 'oracle.json'), JSON.stringify(result,null,2)+'\n');
