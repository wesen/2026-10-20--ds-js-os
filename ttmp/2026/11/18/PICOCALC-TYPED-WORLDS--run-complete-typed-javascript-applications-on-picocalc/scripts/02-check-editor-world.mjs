import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';
import '../../../../../../picocalc-os/compiler/typed-world.js';

const [cc, emu] = process.argv.slice(2);
assert(cc && emu, 'pass P4 GCC and CJI rv32emu');
const os = resolve('picocalc-os');
const source = ['state', 'layout', 'view', 'edit', 'editor'].map(name =>
    readFileSync(join(os, 'worlds/editor', name + '.typed'), 'utf8')).join('\n');
const wasmReactor = readFileSync(join(os, 'build/typed-world-reactor.wasm'));
const wasm = compileTypedWorld(source, wasmReactor);
const wrongCall = source.replace('typedSdkScreen(output,', 'typedSdkScreen(0,');
assert.throws(() => compileTypedWorld(wrongCall, wasmReactor), SyntaxError);
const dir = mkdtempSync(join(tmpdir(), 'typed-editor-reactor-'));
const system = JSON.parse(readFileSync(join(os, 'js/system.json'), 'utf8'));
const worlds = system.worlds.filter(w => ['display', 'keyboard', 'compositor', 'launcher', 'files', 'editor'].includes(w.name));
const large = process.argv.includes('--large');
const edit = process.argv.includes('--edit');
assert(!(large && edit), 'run the capacity and mutation scenarios separately');
const turnBudget = large && !process.argv.includes('--stock-budget') ? 200 : 50;
const contents = large ? ('text '.repeat(15) + '\r\n').repeat(851) + 'x'.repeat(9) :
    'A🙂  long line ' + 'abcd efgh '.repeat(9) + '\r\n\t"hello"\rLast\n';

function run(name, compiled) {
    const js = join(dir, name, 'js'), fs = join(dir, name, 'fs'), out = join(dir, name, 'out');
    mkdirSync(js, {recursive:true});
    mkdirSync(fs, {recursive:true});
    writeFileSync(join(fs, 'entry.txt'), contents);
    copyFileSync(join(os, 'js/prelude.js'), join(js, 'prelude.js'));
    const entries = worlds.map(w => {
        if (w.name === 'editor' && compiled) {
            writeFileSync(join(js, 'editor.wasm'), wasm);
            return {...w, file:'editor.wasm', engine:'wasm', budget_ms:turnBudget};
        }
        mkdirSync(dirname(join(js, w.file)), {recursive:true});
        copyFileSync(join(os, 'js', w.file), join(js, w.file));
        if (large && w.name === 'editor') return {...w, mem_kb:2048};
        return w;
    });
    entries.push({name:'probe',file:'probe.js',claims:['frames.read'],mem_kb:384});
    writeFileSync(join(js, 'system.json'), JSON.stringify({worlds:entries}));
    writeFileSync(join(js, 'probe.js'), `
service("probe").needs("frames").on("frames", (s, m, msg) => {
    if (msg.from !== "editor") return;
    log("EDITOR_FRAME");
    const value = JSON.stringify(m.frame);
    for (let i = 0; i < value.length;) {
        let end = Math.min(i + 180, value.length);
        const last = value.charCodeAt(end - 1);
        if (last >= 0xd800 && last <= 0xdbff) end--;
        log("EDITOR_PART " + value.slice(i, end));
        i = end;
    }
});
`);
    const scenario = join(dir, name + '-scenario.txt');
    writeFileSync(scenario, [
        'wait 2000', 'key e', 'wait 1000', 'capture editor.png',
        'key f1', 'wait 530', 'key d', 'wait 530', 'key enter', 'wait 1000', 'capture opened.png',
        ...(edit ? ['key right', 'wait 530', 'key right', 'wait 530', 'key backspace', 'wait 530',
            'key f5', 'wait 530', 'key f5', 'wait 530', 'type tail', 'wait 530', 'key enter', 'wait 530',
            'key backspace', 'wait 530', 'key enter', 'wait 530',
            'type new', 'wait 530', 'key backspace', 'wait 530', 'key f2', 'wait 1000', 'capture saved.png'] : []),
        'key f1', 'wait 530', 'key d', 'wait 530', 'key f2', 'wait 530',
        'type fresh.txt', 'wait 1000', 'key enter', 'wait 1000', 'capture fresh.png', '',
    ].join('\n'));
    execFileSync(join(os, 'build/picocalc-host'), ['-j', js, '-f', fs, '-o', out, scenario],
        {encoding:'utf8',timeout:15000});
    const log = readFileSync(join(out, 'uart.log'), 'utf8');
    assert.doesNotMatch(log, /crashed|typed world .* rejected/);
    const frames = log.split('probe: EDITOR_FRAME\n').slice(1)
        .map(block => JSON.parse([...block.matchAll(/EDITOR_PART (.*)$/gm)].map(match => match[1]).join('')))
        .filter(frame => frame.tree.kids[0].s !== 'Saving...');
    const statuses = frames.map(frame => frame.tree.kids[0].s);
    assert.equal(statuses[0], 'No file open.');
    assert.equal(statuses[1], 'entry.txt  1:1');
    assert.equal(statuses.at(-1), 'fresh.txt  1:1');
    const saved = edit ? contents.replace('🙂', '').replace(/\r\n?/g, '\n') + 'tail\nne' : contents;
    assert.equal(readFileSync(join(fs, 'entry.txt'), 'utf8'), saved);
    if (edit) assert.equal(statuses.at(-2), `Saved ${Buffer.byteLength(saved)} bytes.`);
    else assert.equal(statuses.length, 3);
    const pictures = edit ? ['editor', 'opened', 'saved', 'fresh'] : ['editor', 'opened', 'fresh'];
    return {frames, pixels:pictures.map(name => readFileSync(join(out, name + '.png'))), saved};
}

try {
    const original = run('js', false), compiled = run('wasm', true);
    assert.deepEqual(compiled, original);
    const reactor = join(dir, 'reactor.so'), app = join(dir, 'editor.so'), driver = join(dir, 'driver.elf');
    const sdk = join(os, 'sdk'), runtime = join(sdk, 'typed');
    execFileSync(cc, [
        '-march=rv32imafc_zicsr_zifencei', '-mabi=ilp32f', '-Os', '-fPIC', '-shared', '-nostartfiles',
        '-nostdlib', '-e', 'app_main', '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections',
        '-fvisibility=hidden', '-Wl,--strip-all', '-Wl,-z,max-page-size=16', '-Wno-attributes',
        '-I', sdk, '-o', reactor, join(runtime, 'world.c'), join(runtime, 'rv32-slot.S'), join(sdk, 'nw_elf.c'),
    ], {stdio:'inherit'});
    const rv32Reactor = readFileSync(reactor);
    const elf = compileTypedWorldRv32(source, rv32Reactor);
    assert.throws(() => compileTypedWorldRv32(wrongCall, rv32Reactor), SyntaxError);
    writeFileSync(app, elf);
    const expected = join(dir, 'expected.h');
    writeFileSync(expected, `static const char settled[] = ${JSON.stringify(JSON.stringify(contents))};\n` +
        (edit ? `#define TEST_EDIT\nstatic const char saved_text[] = ${JSON.stringify(original.saved)};\n` : ''));
    execFileSync(cc, [
        '-march=rv32im', '-mabi=ilp32', '-O2', '-fno-builtin', '-msmall-data-limit=0',
        '-mno-relax', '-nostdlib', '-Wl,-Ttext=0x10000', '-Wl,-e,_start', '-I', sdk, '-I', dir,
        '-o', driver, fileURLToPath(new URL('02-editor-world-driver.c', import.meta.url)),
        ...['libc.o', 'hostcalls.o', 'softfloat.o'].map(file => join(dirname(emu), file)),
    ], {stdio:'inherit'});
    const rv32 = execFileSync(emu, [driver, app], {encoding:'utf8',timeout:15000}).trim().split('\n');
    assert.equal(rv32.pop(), 'Typed Editor startup, file read, missing file, and grant release passed');
    assert.deepEqual(rv32.map(line => JSON.parse(line)).filter(frame => frame.kids[0].s !== 'Saving...'),
        original.frames.map(frame => frame.tree));
    console.log(JSON.stringify({inputBytes:Buffer.byteLength(contents), matchingWasmFramebuffers:compiled.pixels.length,
        rv32Open:true, wasmBytes:wasm.length, elfBytes:elf.length, wasmTurnBudgetMs:turnBudget}));
} finally {
    if (process.argv.includes('--keep-fixture')) console.error(dir);
    else rmSync(dir, {recursive:true,force:true});
}
