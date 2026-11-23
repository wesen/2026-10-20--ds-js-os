// Files as a complete Typed world on the generic reactor (Wasm), against the JavaScript Files as the oracle.
// From PICOCALC-TYPED-APPS scripts/01-check-files-wasm.mjs; PICOCALC-AGENDA-TYPED-WORLD moved the app off its C reactor.
// Run from the repository root.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import vm from 'node:vm';
import '../../lib/compiler.mjs';

const os = resolve('firmware');
const world = join(os, '../apps/typed/files');
const original = readFileSync(join(os, '../apps/js/picocalc/apps/files.js'), 'utf8');
const {sources} = JSON.parse(readFileSync(join(world, 'app.json'), 'utf8'));
const source = sources.map(name => readFileSync(join(world, name), 'utf8') + '\n').join('');
const wasm = compileTypedWorld(source, readFileSync(join(os, 'build/typed-world-reactor.wasm')));
// The name rule alone, as a module.
const typed = typedWasm.compile(readFileSync(join(world, 'files.typed'), 'utf8'));
const {instance} = await WebAssembly.instantiate(typed.bytes);
const mem = new DataView(instance.exports.memory.buffer);
function encode(text, base) {
    mem.setUint32(base, text.length, true);
    for (let i = 0; i < text.length; i++) mem.setUint16(base + 4 + i * 2, text.charCodeAt(i), true);
}
const nameRule = vm.runInNewContext(original.slice(0, original.indexOf('const fiJoin')) + '\nFI_NAME');
const names = ['', ' x ', 'a.b', 'a.', 'a . b', 'a/b', '.dot', 'name-', 'a_b', '𐀀',
    'A'.repeat(64), 'A'.repeat(65), '\u2003AB\ufeff', 'x\u00a0x', 'one' + '\0', 'a', 'a  ', 'a+b'];
for (const name of names) {
    encode(name, 0);
    mem.setInt32(512, 64, true);
    const expected = name.trim();
    const n = instance.exports.filesName(0, 512);
    assert.equal(n, nameRule.test(expected) ? expected.length : -1, JSON.stringify(name));
    if (n >= 0) assert.equal(Array.from({length:n}, (_, i) => String.fromCharCode(mem.getUint16(516 + 2*i, true))).join(''), expected);
}
const base = mkdtempSync(join(tmpdir(), 'typed-files-'));
const manifest = JSON.parse(readFileSync(join(os, '../apps/js/picocalc/system.json'), 'utf8'));
const system = manifest.worlds.filter(w => ['keyboard','display','compositor','launcher','files','editor'].includes(w.name));
const actions = [
    'key d', 'key enter', 'key backspace', 'key enter',
    'key f3', 'type Sub', 'key enter',
    'key f4', 'key backspace', 'key backspace', 'key backspace', 'type Renamed', 'key enter',
    'key f5', 'key f5',
    'key enter', 'key end', 'type X', 'key f2', 'key esc',
    'key f2', 'type blank.txt', 'key enter', 'type New', 'key f2', 'key esc',
];
const pause = action => action.startsWith('type ') ? 1400 : 530;
function run(variant) {
    const root = join(base, variant), js = join(root, 'js'), fs = join(root, 'fs'), out = join(root, 'out');
    mkdirSync(js, {recursive:true});
    mkdirSync(join(fs, 'folder'), {recursive:true});
    writeFileSync(join(fs, 'outside.txt'), 'x'.repeat(1280));
    writeFileSync(join(fs, 'folder/one.txt'), 'existing\n');
    // Sorting by UTF-16 unit with directories first, and sizes in every unit.
    // (Names after outside.txt, so the selection the keys walk is the same.)
    for (const name of ['zeta', 'pq', 'Ärger', '𐀀x', '\ue000y']) writeFileSync(join(fs, name), 'x'.repeat(name.length * 700));
    writeFileSync(join(fs, 'zbig.bin'), Buffer.alloc(2726297));
    const worlds = system.map(w => {
        if (w.name === 'files' && variant === 'wasm') return {...w, file:'files.wasm', engine:'wasm', mem_kb:768};
        mkdirSync(dirname(join(js, w.file)), {recursive:true});
        copyFileSync(join(os, '../apps/js/picocalc', w.file), join(js, w.file));
        return w;
    });
    copyFileSync(join(os, '../apps/js/picocalc/prelude.js'), join(js, 'prelude.js'));
    writeFileSync(join(js, 'files.wasm'), wasm);
    writeFileSync(join(js, 'system.json'), JSON.stringify({worlds:[...worlds,
        {name:'probe',file:'probe.js',claims:['frames.read'],mem_kb:384}]}));
    writeFileSync(join(js, 'probe.js'), `
service("probe").needs("frames").on("frames", (s,m,msg) => {
  if (msg.from !== "files") return;
  const [heading, list, prompt, note] = m.frame.tree.kids;
  log("FILES_FRAME " + JSON.stringify([now(), [heading.kids[0].s, list.items?.map(i => [i.label, i.right]) || [],
      list.items?.[list.sel]?.label, prompt.prompt, note.s, prompt.value]]));
});
`);
    const scenario = join(root, 'keys.txt');
    writeFileSync(scenario, 'wait 1500\n' + actions.map(action => action + '\nwait ' + pause(action) + '\n').join('') + 'capture final.png\n');
    execFileSync(join(os, 'build/picocalc-host'), ['-j', js, '-f', fs, '-o', out, scenario],
        {encoding:'utf8',timeout:15000});
    const log = readFileSync(join(out, 'uart.log'), 'utf8');
    assert.doesNotMatch(log, /crashed/);
    assert.equal(readFileSync(join(fs, 'outside.txt'), 'utf8'), 'x'.repeat(1280));
    assert.equal(readFileSync(join(fs, 'folder/one.txt'), 'utf8'), 'existingX\n');
    assert.equal(readFileSync(join(fs, 'folder/blank.txt'), 'utf8'), 'New');
    assert(!existsSync(join(fs, 'folder/Renamed')));
    const frames = [...log.matchAll(/FILES_FRAME (.+)$/gm)].map(row => JSON.parse(row[1]));
    let at = 1500;
    const states = actions.map(action => {
        // sim/board.c advances 70 ms for a key or 90 ms per typed character.
        const elapsed = action.startsWith('type ') ? 90 * action.slice(5).length : 70;
        at += elapsed + pause(action);
        return frames.findLast(([time]) => time < at)?.[1];
    });
    assert.equal(states[2][0], '/');
    assert.equal(states[2][2], 'folder/', 'parent restores directory selection');
    assert.deepEqual(states[2][1][1], ['outside.txt', '1.3 KB']);
    assert(states[6][1].some(([label]) => label === 'Sub/'));
    assert(states[12][1].some(([label]) => label === 'Renamed/'));
    assert.equal(states[13][4], 'F5 again deletes Renamed (it must be empty)');
    assert.equal(states[14][4], 'Deleted Renamed');
    assert(states.at(-1)[1].some(([label]) => label === 'blank.txt'));
    assert.deepEqual(states[2][1].map(([label]) => label),
        ['folder/', 'outside.txt', 'pq', 'zbig.bin', 'zeta', 'Ärger', '𐀀x', '\ue000y']);
    assert.deepEqual(states[2][1][3], ['zbig.bin', '2.6 MB']);
    return states;
}
try {
    const legacy = run('js'), compiled = run('wasm');
    assert.deepEqual(compiled, legacy);
    console.log(JSON.stringify({nameCases:names.length, matchedFrames:compiled.length, wasmBytes:wasm.length,
        rv32CodeBytes:typedRv32.compile(source, typedWorld.imports, 96 * 1024).image.length, editorWrites:true}));
} finally {
    if (process.argv.includes("--keep-fixture")) console.error(base);
    else rmSync(base, {recursive:true,force:true});
}
