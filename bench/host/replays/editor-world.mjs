// Promoted from PICOCALC-RAY-PARITY scripts/04-check-editor-world.mjs (PICOCALC-REPO-LAYOUT Phase A); run from the repository root.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import '../../lib/compiler.mjs';

const [cc, emu] = process.argv.slice(2);
assert(cc && emu, 'pass P4 GCC and CJI rv32emu');
const os = resolve('picocalc-os');
const editorDir = join(os, 'worlds/editor');
const sources = readFileSync(join(editorDir, 'source.list'), 'utf8').trim().split('\n');
const source = sources.map(name => readFileSync(join(editorDir, name), 'utf8') + '\n').join('');
const wasmReactor = readFileSync(join(os, 'build/typed-world-reactor.wasm'));
const wasm = compileTypedWorld(source, wasmReactor);
const wrongCall = source.replace('typedSdkScreen(output,', 'typedSdkScreen(0,');
assert.throws(() => compileTypedWorld(wrongCall, wasmReactor), SyntaxError);
const dir = mkdtempSync(join(tmpdir(), 'typed-editor-reactor-'));
const system = JSON.parse(readFileSync(join(os, 'js/system.json'), 'utf8'));
const worlds = system.worlds.filter(w => ['display', 'keyboard', 'compositor', 'launcher', 'files', 'editor'].includes(w.name));
const large = process.argv.includes('--large');
const edit = process.argv.includes('--edit');
const positions = process.argv.includes('--positions');
const denseSearch = process.argv.includes('--dense-search');
const tailSearch = process.argv.includes('--tail-search');
const navigation = process.argv.includes('--late-navigation');
const longSearch = denseSearch || tailSearch || navigation;
const find = process.argv.includes('--find');
const markdown = process.argv.includes('--markdown');
const previewLarge = process.argv.includes('--preview-large');
const previewLine = process.argv.includes('--preview-line');
const previewInline = process.argv.includes('--preview-inline');
const previewDenseInline = process.argv.includes('--preview-dense-inline');
const fullInline = previewInline || previewDenseInline;
const capacity = previewLarge || previewLine || fullInline;
const preview = markdown || capacity;
assert([large, edit, positions, find, markdown, previewLarge, previewLine, previewInline, previewDenseInline, denseSearch, tailSearch, navigation].filter(Boolean).length <= 1, 'select at most one workflow');
const turnBudget = (large || previewLine || fullInline || longSearch) && !process.argv.includes('--stock-budget') ? 200 : 50;
const filename = preview ? 'entry.MD' : 'entry.txt';
const inlinePrefix = '# Straße [**' + 'ΐ'.repeat(60) + '🙂`c`**](';
const inlineSuffix = ') `END` EOF INLINE';
const inline = inlinePrefix + 'd'.repeat(65536 - Buffer.byteLength(inlinePrefix + inlineSuffix)) + inlineSuffix;
const denseWord = '[**x**](destination) ';
const denseLength = 65536 - Buffer.byteLength('EOF INLINE');
const denseInline = ' '.repeat(denseLength % denseWord.length) +
    denseWord.repeat(Math.floor(denseLength / denseWord.length)) + 'EOF INLINE';
const contents = previewDenseInline ? denseInline : previewInline ? inline : previewLarge ?
    ('A reading paragraph, followed by a blank line.\n\n').repeat(450) + 'END OF PREVIEW' :
    previewLine ? '🙂'.repeat(4508) + ' END OF PREVIEW' :
    markdown ? '# Straße **Title**\n- one\n9) numbered\n```\ncode\n\n```\n> quote `text`\n**plain** [link](u)\ncontinued\n\n### Low\n```\n' +
        'more code\n'.repeat(22) + 'last code\n`' + '🙂'.repeat(54) + ' word  tab\tend' :
    find ? 'A🙂 BETA beta beta\nKelvin K and İce\nlast BeTa\noverlap ababa\n' :
    large || longSearch ? ('text '.repeat(15) + '\r\n').repeat(851) + (tailSearch || navigation ? 'needlezzz' : 'x'.repeat(9)) :
    'A🙂  long line ' + 'abcd efgh '.repeat(9) + '\r\n\t"hello"\rLast\n';
const findActions = longSearch ? [
    'key f3', denseSearch ? 'type text text z' : 'type needle', 'key enter',
    'wait 1500', 'capture found.png', 'key f4', 'wait 1500',
    ...(navigation ? [
        'key right', 'key up', ...Array(3).fill('key pgup'), 'wait 1500', 'key f4', 'wait 1500',
        'key backspace', 'key enter', 'key end', 'type !', 'key f2', 'wait 1000', 'capture saved.png',
    ] : []),
] : [
    'key f4', 'key f3', 'type BeTx', 'key backspace', 'type A', 'key enter',
    'key f4', 'key f4', 'key f4', 'key f4', 'capture found.png', 'key f3', 'key esc',
    'key f3', 'type k', 'key enter', 'key f4', 'key f3', 'key backspace', 'type ce', 'key enter',
    'key f3', 'key backspace', 'key backspace', 'type zzz', 'key enter',
    'key f3', 'key backspace', 'key backspace', 'key backspace', 'type aba', 'key enter',
];
const markdownActions = [
    'key down', 'key end', 'key enter', 'key enter', 'key down', 'key end', 'key enter',
    'type ten', 'key f2', 'key f6', 'capture preview.png', 'key down', 'key pgdn', 'key up',
    'key esc', 'key f6', 'key f6', 'key f5', 'key f5', 'capture fence.png',
];
const previewLargeActions = [
    'key f6', 'capture preview.png',
    ...Array(previewLine ? 7 : 57).fill('key pgdn'), 'capture preview-end.png',
    ...Array(4).fill('key pgup'), 'capture preview-back.png', 'key esc',
];
const previewInlineActions = [
    'key f6', 'wait 2500', 'capture preview.png', 'key pgdn', 'key pgup', 'key esc',
];
const previewDenseActions = [
    'key f6', 'wait 6000', 'capture preview.png',
    ...Array(8).fill('key pgdn'), 'capture preview-end.png', 'key esc',
];
const previewActions = previewDenseInline ? previewDenseActions : previewInline ? previewInlineActions : capacity ? previewLargeActions : markdownActions;

// Compare the compositor's visual row model for each captured frame.
const compositor = readFileSync(join(os, 'js/system/compositor.js'), 'utf8');
const wrap = runInNewContext(compositor.slice(compositor.indexOf('const len ='), compositor.indexOf('// ---- layout:')) + '\nwrapText');
function visualFrame(frame) {
    const node = frame.kids[1];
    if (node?.t !== 'lines') return frame;
    const rows = node.wrapped ? node.items : node.items.flatMap(item =>
        wrap(item.s, 49 - (item.indent ?? 0)).map(s => ({...item, s})));
    const first = node.wrapped ? 0 : Math.min(node.scroll ?? 0, Math.max(0, rows.length - 17));
    return {...frame, kids:[frame.kids[0], rows.slice(first, first + 17).map(row => ({...row}))]};
}

function distinct(frames) {
    return frames.filter((frame, i) => i === 0 || JSON.stringify(frame) !== JSON.stringify(frames[i - 1]));
}

if (find) {
    // Verify the folding assumptions behind ASCII keyboard queries.
    const asciiFolds = [], expandingFolds = [];
    for (let cp = 128; cp <= 0x10ffff; cp++) {
        const input = String.fromCodePoint(cp), lower = input.toLowerCase();
        if (/[\x20-\x7e]/.test(lower)) asciiFolds.push(cp);
        if (input.length !== lower.length) expandingFolds.push(cp);
    }
    assert.deepEqual(asciiFolds, [304, 8490]);
    assert.deepEqual(expandingFolds, [304]);
}
const seed = {pos: {'entry.txt':[0, 2, 0, 1792662000000]}};
for (let i = 0; i < 19; i++) seed.pos['prior-' + i] = [0, 0, 0, 1792662000001 + i];

function run(name, compiled) {
    const js = join(dir, name, 'js'), fs = join(dir, name, 'fs'), out = join(dir, name, 'out');
    const store = join(dir, name, 'store'), record = join(store, 'w/editor');
    mkdirSync(js, {recursive:true});
    mkdirSync(fs, {recursive:true});
    writeFileSync(join(fs, filename), contents);
    if (positions || navigation) mkdirSync(dirname(record), {recursive:true});
    if (positions) writeFileSync(record, JSON.stringify(seed));
    copyFileSync(join(os, 'js/prelude.js'), join(js, 'prelude.js'));
    const entries = worlds.map(w => {
        if (w.name === 'editor' && compiled) {
            writeFileSync(join(js, 'editor.wasm'), wasm);
            return {...w, file:'editor.wasm', engine:'wasm', budget_ms:turnBudget, mem_kb:768};
        }
        mkdirSync(dirname(join(js, w.file)), {recursive:true});
        copyFileSync(join(os, 'js', w.file), join(js, w.file));
        if ((large || capacity || longSearch) && w.name === 'editor') {
            return {...w, mem_kb:fullInline ? 8192 : 2048, ...(fullInline ? {budget_ms:1000} : {})};
        }
        return w;
    });
    entries.push({name:'probe',file:'probe.js',claims:['frames.read'],mem_kb:capacity ? 2048 : 384});
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
        ...(find || longSearch ? findActions.flatMap(action => [action, 'wait 530']) : []),
        ...(preview ? previewActions.flatMap(action => [action, 'wait 530']) : []),
        ...(positions ? ['key right', 'wait 530', 'key esc', 'wait 530'] : []),
        ...(edit ? ['key right', 'wait 530', 'key right', 'wait 530', 'key backspace', 'wait 530',
            'key f5', 'wait 530', 'key f5', 'wait 530', 'type tail', 'wait 530', 'key enter', 'wait 530',
            'key backspace', 'wait 530', 'key enter', 'wait 530',
            'type new', 'wait 530', 'key backspace', 'wait 530', 'key f2', 'wait 1000', 'capture saved.png',
            'type X', 'wait 530', 'key esc', 'wait 530', 'key esc', 'wait 530'] : []),
        'key f1', 'wait 530', 'key d', 'wait 530', 'key f2', 'wait 530',
        'type fresh.txt', 'wait 1000', 'key enter', 'wait 1000', 'capture fresh.png',
        ...(positions ? ['key esc', 'wait 530'] : []), '',
    ].join('\n'));
    const storeArgs = positions || navigation ? ['-s', store] : [];
    execFileSync(join(os, 'build/picocalc-host'), ['-j', js, '-f', fs, '-o', out, ...storeArgs, scenario],
        {encoding:'utf8',timeout:15000});
    const log = readFileSync(join(out, 'uart.log'), 'utf8');
    assert.doesNotMatch(log, /crashed|typed world .* rejected/);
    const frames = log.split('probe: EDITOR_FRAME\n').slice(1)
        .map(block => JSON.parse([...block.matchAll(/EDITOR_PART (.*)$/gm)].map(match => match[1]).join('')))
        .filter(frame => frame.tree.kids[0].s !== 'Saving...');
    const statuses = frames.map(frame => frame.tree.kids[0].s);
    assert.equal(statuses[0], 'No file open.');
    assert.equal(statuses[1], `${filename}  1:${positions ? 3 : 1}`);
    assert.equal(statuses.at(-1), 'fresh.txt  1:1');
    const saved = markdown ? contents.replace('- one\n9) numbered\n', '- one\n\n9) numbered\n10) ten\n') :
        navigation ? contents.replace(/\r\n/g, '\n') + '!' :
        edit ? contents.replace('🙂', '').replace(/\r\n?/g, '\n') + 'tail\nne' : contents;
    assert.equal(readFileSync(join(fs, filename), 'utf8'), saved);
    if (edit) {
        assert(statuses.includes(`Saved ${Buffer.byteLength(saved)} bytes.`));
        assert.equal(statuses.at(-2), 'Changes discarded.');
    }
    else if (find) {
        assert(statuses.includes('F3 to find first.'));
        assert(statuses.includes('Not found: zzz'));
        const marks = frames.find(frame => frame.tree.kids[0].s === 'Find: BeTA_')?.tree.kids[1].marks;
        assert.equal(marks?.length, 4);
        const overlaps = frames.find(frame => frame.tree.kids[0].s === 'Find: aba_')?.tree.kids[1].marks;
        assert.deepEqual(overlaps, [[3, 8, 3, 'soft'], [3, 10, 3, 'soft']]);
    } else if (navigation) {
        assert(statuses.includes('entry.txt  852:2'));
        assert(statuses.includes('entry.txt  851:47'));
        assert(statuses.includes('* entry.txt  852:11'));
        assert(statuses.includes(`Saved ${Buffer.byteLength(saved)} bytes.`));
    } else if (longSearch) {
        assert.equal(statuses.at(-2), denseSearch ? 'Not found: text text z' : 'entry.txt  852:1');
    }
    if (tailSearch || navigation) {
        const hit = frames.find(frame => frame.tree.kids[0].s === 'entry.txt  852:1').tree.kids[1];
        assert.equal(hit.rows.length, 17);
        assert.deepEqual(hit.cursor, [16, 0]);
        assert.equal(hit.rows[hit.cursor[0]].s, 'needlezzz');
        assert(hit.marks.some(mark => mark[0] === hit.cursor[0] && mark[2] === 6));
    }
    if (markdown) {
        assert.deepEqual(frames[1].tree.kids[1].rows.slice(0, 8).map(row => row.color),
            ['accent', 'ink', 'ink', 'blue', 'blue', 'blue', 'blue', 'muted']);
        const preview = frames.find(frame => frame.tree.kids[1]?.t === 'lines').tree.kids[1];
        assert(preview.items.some(item => item.s === 'STRASSE TITLE'));
        assert(preview.items.some(item => item.s === 'plain link continued'));
        assert(preview.items.some(item => item.s === '10) ten'));
        const viewport = frames.at(-2).tree.kids[1].rows;
        assert.equal(viewport.length, 17);
        assert(viewport.every(row => row.color === 'blue'));
    } else if (previewInline) {
        const first = frames.find(frame => frame.tree.kids[1]?.t === 'lines');
        const rows = visualFrame(first.tree).kids[1].map(row => row.s).join(' ');
        assert(rows.includes('STRASSE'));
        assert(rows.includes('END EOF INLINE'));
        assert(rows.includes('Ϊ́'));
        assert(!rows.includes(']('));
    } else if (previewDenseInline) {
        const windows = frames.filter(frame => frame.tree.kids[1]?.t === 'lines');
        const rows = visualFrame(windows.at(-1).tree).kids[1].map(row => row.s).join(' ');
        assert(rows.includes('EOF INLINE'));
        assert(!rows.includes('destination'));
    } else if (capacity) {
        const windows = frames.filter(frame => frame.tree.kids[1]?.t === 'lines');
        assert(windows.some(frame => visualFrame(frame.tree).kids[1].some(row => row.s === 'END OF PREVIEW')));
        assert(!visualFrame(windows.at(-1).tree).kids[1].some(row => row.s === 'END OF PREVIEW'));
        if (compiled) assert(windows.every(frame => frame.tree.kids[1].items.length <= 17));
    } else if (!edit && !find && !longSearch) assert.equal(statuses.length, positions ? 4 : 3);
    const pictures = ['editor', 'opened', ...(edit || navigation ? ['saved'] : []), ...(find || longSearch ? ['found'] : []),
        ...(markdown ? ['preview', 'fence'] : []),
        ...(previewInline ? ['preview'] : previewDenseInline ? ['preview', 'preview-end'] : capacity ? ['preview', 'preview-end', 'preview-back'] : []), 'fresh'];
    const pixels = pictures.map(name => readFileSync(join(out, name + '.png')));
    if (navigation) {
        const restarted = join(dir, name, 'restart'), scenario = join(dir, name + '-restart.txt');
        writeFileSync(scenario, 'wait 2000\nkey d\nwait 530\nkey enter\nwait 2500\ncapture restored.png\n');
        execFileSync(join(os, 'build/picocalc-host'), ['-j', js, '-f', fs, '-o', restarted, ...storeArgs, scenario],
            {encoding:'utf8',timeout:15000});
        const restartLog = readFileSync(join(restarted, 'uart.log'), 'utf8');
        assert(!/crashed|timed out/.test(restartLog));
        assert.match(restartLog, /entry\.txt  852:11/);
        pixels.push(readFileSync(join(restarted, 'restored.png')));
    }
    if (!positions) {
        const visual = preview ? distinct(frames.map(frame => ({...frame, tree:visualFrame(frame.tree)}))) : frames;
        return {frames:visual, pixels, saved};
    }
    const kept = JSON.parse(readFileSync(record, 'utf8')).pos;
    assert.equal(Object.keys(kept).length, 20);
    assert(!('prior-0' in kept), 'oldest entry is evicted');
    assert.deepEqual(kept['entry.txt'].slice(0, 3), [0, 3, 0]);
    assert.deepEqual(kept['fresh.txt'].slice(0, 3), [0, 0, 0]);
    const restarted = join(dir, name, 'restart'), restartScenario = join(dir, name + '-restart.txt');
    writeFileSync(restartScenario, 'wait 2000\nkey d\nwait 1000\nkey enter\nwait 1000\ncapture restored.png\n');
    execFileSync(join(os, 'build/picocalc-host'), ['-j', js, '-f', fs, '-o', restarted, ...storeArgs, restartScenario],
        {encoding:'utf8',timeout:15000});
    const restartLog = readFileSync(join(restarted, 'uart.log'), 'utf8');
    assert.match(restartLog, /entry\.txt  1:4/);
    pixels.push(readFileSync(join(restarted, 'restored.png')));
    return {frames, pixels, saved, positions:Object.fromEntries(Object.entries(kept).map(([key, pos]) =>
        [key, pos.slice(0, 3)]))};
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
        '-I', sdk, '-o', reactor, join(runtime, 'world.c'), join(runtime, 'chess-psix.c'), join(runtime, 'rv32-slot.S'), join(sdk, 'nw_elf.c'), join(os, 'third_party/quickjs/libunicode.c'), fileURLToPath(new URL('libgcc-helpers.c', import.meta.url)),
    ], {stdio:'inherit'});
    const rv32Reactor = readFileSync(reactor);
    const elf = compileTypedWorldRv32(source, rv32Reactor);
    assert.throws(() => compileTypedWorldRv32(wrongCall, rv32Reactor), SyntaxError);
    writeFileSync(app, elf);
    const expected = join(dir, 'expected.h');
    writeFileSync(expected, `#define FIRST_FILE ${JSON.stringify(filename)}\nstatic const char settled[] = ${JSON.stringify(JSON.stringify(contents))};\n` +
        (edit ? '#define TEST_EDIT\n' : '') +
        (navigation ? '#define TEST_NAVIGATION\n' : '') +
        (edit || markdown || navigation ? `static const char saved_text[] = ${JSON.stringify(original.saved)};\n` : '') +
        (positions ? `#define TEST_POS\nstatic const char initial_record[] = ${JSON.stringify(JSON.stringify(seed))};\n` : '') +
        (find || longSearch ? '#define TEST_FIND\nstatic const char *const find_actions[] = {' +
            findActions.filter(action => action.startsWith('key ') || action.startsWith('type ')).map(action => JSON.stringify(action)).join(',') +
            '};\n' : '') +
        (preview ? (markdown ? '#define TEST_MARKDOWN\n' : '') + '#define TEST_PREVIEW\nstatic const char *const markdown_actions[] = {' +
            previewActions.filter(action => action.startsWith('key ') || action.startsWith('type ')).map(action => JSON.stringify(action)).join(',') +
            '};\n' : ''));
    execFileSync(cc, [
        '-march=rv32im', '-mabi=ilp32', '-O2', '-fno-builtin', '-msmall-data-limit=0',
        '-mno-relax', '-nostdlib', '-Wl,-Ttext=0x10000', '-Wl,-e,_start', '-I', sdk, '-I', dir,
        '-o', driver, fileURLToPath(new URL('editor-world-driver.c', import.meta.url)),
        ...['libc.o', 'hostcalls.o', 'softfloat.o'].map(file => join(dirname(emu), file)),
    ], {stdio:'inherit'});
    const rv32 = execFileSync(emu, [driver, app], {encoding:'utf8',timeout:15000}).trim().split('\n');
    assert.equal(rv32.pop(), 'Typed Editor startup, file read, missing file, and grant release passed');
    const trees = rv32.map(line => JSON.parse(line)).filter(frame => frame.kids[0].s !== 'Saving...');
    assert.deepEqual(distinct(trees.map(frame => preview ? visualFrame(frame) : frame)),
        original.frames.map(frame => frame.tree));
    console.log(JSON.stringify({inputBytes:Buffer.byteLength(contents), matchingWasmFramebuffers:compiled.pixels.length,
        rv32Open:true, wasmBytes:wasm.length, elfBytes:elf.length, wasmTurnBudgetMs:turnBudget}));
} finally {
    if (process.argv.includes('--keep-fixture')) console.error(dir);
    else rmSync(dir, {recursive:true,force:true});
}
