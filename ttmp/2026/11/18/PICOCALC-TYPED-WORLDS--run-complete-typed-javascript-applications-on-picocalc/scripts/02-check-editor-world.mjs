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
const source = ['layout', 'view', 'editor'].map(name =>
    readFileSync(join(os, 'worlds/editor', name + '.typed'), 'utf8')).join('\n');
const wasmReactor = readFileSync(join(os, 'build/typed-world-reactor.wasm'));
const wasm = compileTypedWorld(source, wasmReactor);
const wrongCall = source.replace('typedSdkScreen(output,', 'typedSdkScreen(0,');
assert.throws(() => compileTypedWorld(wrongCall, wasmReactor), SyntaxError);
const dir = mkdtempSync(join(tmpdir(), 'typed-editor-reactor-'));
const system = JSON.parse(readFileSync(join(os, 'js/system.json'), 'utf8'));
const worlds = system.worlds.filter(w => ['display', 'keyboard', 'compositor', 'launcher', 'editor'].includes(w.name));

function run(name, compiled) {
    const js = join(dir, name, 'js'), fs = join(dir, name, 'fs'), out = join(dir, name, 'out');
    mkdirSync(js, {recursive:true});
    mkdirSync(fs, {recursive:true});
    copyFileSync(join(os, 'js/prelude.js'), join(js, 'prelude.js'));
    const entries = worlds.map(w => {
        if (w.name === 'editor' && compiled) {
            writeFileSync(join(js, 'editor.wasm'), wasm);
            return {...w, file:'editor.wasm', engine:'wasm'};
        }
        mkdirSync(dirname(join(js, w.file)), {recursive:true});
        copyFileSync(join(os, 'js', w.file), join(js, w.file));
        return w;
    });
    entries.push({name:'probe',file:'probe.js',claims:['frames.read'],mem_kb:384});
    writeFileSync(join(js, 'system.json'), JSON.stringify({worlds:entries}));
    writeFileSync(join(js, 'probe.js'), `
service("probe").needs("frames").on("frames", (s, m, msg) => {
    if (msg.from === "editor") log("EDITOR_FRAME " + JSON.stringify(m.frame));
});
`);
    const scenario = join(dir, name + '-scenario.txt');
    writeFileSync(scenario, 'wait 2000\nkey e\nwait 1000\ncapture editor.png\n');
    execFileSync(join(os, 'build/picocalc-host'), ['-j', js, '-f', fs, '-o', out, scenario],
        {encoding:'utf8',timeout:15000});
    const log = readFileSync(join(out, 'uart.log'), 'utf8');
    assert.doesNotMatch(log, /crashed|typed world .* rejected/);
    const frame = JSON.parse(log.match(/EDITOR_FRAME (.+)$/m)?.[1] ?? 'null');
    assert.equal(frame?.tree?.kids?.[0]?.s, 'No file open.');
    return {frame, pixels:readFileSync(join(out, 'editor.png'))};
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
    writeFileSync(expected, 'static const char screen[] = ' + JSON.stringify(JSON.stringify(original.frame.tree)) + ';\n');
    execFileSync(cc, [
        '-march=rv32im', '-mabi=ilp32', '-O2', '-fno-builtin', '-msmall-data-limit=0',
        '-mno-relax', '-nostdlib', '-Wl,-Ttext=0x10000', '-Wl,-e,_start', '-I', sdk, '-I', dir,
        '-o', driver, fileURLToPath(new URL('02-editor-world-driver.c', import.meta.url)),
        ...['libc.o', 'hostcalls.o', 'softfloat.o'].map(file => join(dirname(emu), file)),
    ], {stdio:'inherit'});
    assert.equal(execFileSync(emu, [driver, app], {encoding:'utf8',timeout:15000}).trim(),
        'Typed Editor metadata and start frame passed');
    console.log(JSON.stringify({matchingWasmFramebuffer:true, rv32Startup:true, wasmBytes:wasm.length, elfBytes:elf.length}));
} finally {
    if (process.argv.includes('--keep-fixture')) console.error(dir);
    else rmSync(dir, {recursive:true,force:true});
}
