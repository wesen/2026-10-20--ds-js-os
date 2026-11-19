import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/worlds/agenda/compile.js';

const os = resolve('picocalc-os');
const host = process.argv[2] ? resolve(process.argv[2]) : join(os, 'build/picocalc-host');
const world = join(os, 'worlds/agenda');
const scratch = mkdtempSync(join(tmpdir(), 'picocalc-agenda-wasm-'));
const runtime = join(os, 'build/agenda-reactor.wasm');
const asset = join(scratch, 'agenda.wasm');
const fsRoot = join(scratch, 'fs');
const out = join(scratch, 'out');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

execFileSync('make', ['-C', os, 'agenda-reactor'], {stdio: ['ignore', 'pipe', 'inherit']});

const source = ['reminder.typed', 'entry.typed'].map(name => readFileSync(join(world, name), 'utf8')).join('\n');
const object = readFileSync(runtime);
const bytes = compileAgenda(source, object);
assert(WebAssembly.validate(bytes));
assert.throws(() => typedWasm.linkWorld(source.replace('title: buffer, task: Task): bool {\n    if (!scanTask',
    'title: buffer, task: Task, unused: i32): bool {\n    if (!scanTask'), object, ['parseTask']), /slot signature mismatch/);
assert.throws(() => compileAgenda(source.replace('    done: bool;\n    textStart: i32;',
    '    textStart: i32;\n    done: bool;'), object), /Task fields do not match/);
writeFileSync(asset, bytes);

mkdirSync(join(fsRoot, 'notes'), {recursive: true});
writeFileSync(join(fsRoot, 'notes/todo.txt'), '# Tasks\n- [ ] dentist 🦷 @2026-11-03 14:30 !15m\n- [x] done\n- book a train\n');
writeFileSync(join(scratch, 'prelude.js'), readFileSync(join(os, 'js/prelude.js')));
writeFileSync(join(scratch, 'system.json'), JSON.stringify({worlds:[
    {name:'agenda-wasm',file:'agenda.wasm',engine:'wasm',claims:['fs:/notes'],mem_kb:384,budget_ms:100},
    {name:'peer',file:'peer.js',claims:['frames.read','sys.read'],mem_kb:512},
    {name:'compositor',file:'notify.js',mem_kb:384},
]}));
writeFileSync(join(scratch, 'notify.js'), `
service("compositor").on("notify", (s, message, from) => {
  log("AGENDA_NOTICE " + JSON.stringify([message, from.from, clock.wall()]));
});
`);
writeFileSync(join(scratch, 'peer.js'), `
service("peer")
  .needs("frames")
  .on("frames", (s, frame, msg) => { if (msg.from === "agenda-wasm") log("AGENDA_FRAME " + JSON.stringify(frame.frame.tree)); })
  .onStart(async () => {
    await sleep(30);
    const result = await ask("agenda-wasm", "agenda.parse", {line: "- [ ] dentist 🦷 @2026-11-03 14:30 !15m"});
    log("AGENDA_REPLY " + JSON.stringify(result));
    const world = sys.worlds().find(w => w.name === "agenda-wasm");
    log("AGENDA_ENGINE " + JSON.stringify([world.engine, world.state, world.kind]));
    try {
      await ask("agenda-wasm", "agenda.parse", {line: 7});
    } catch (e) { log("AGENDA_REJECT " + e.message); }
  });
`);
execFileSync(host, ['-vv', '-j', scratch, '-o', out, '-f', fsRoot, '-w', 'unset', '-t', '1000'],
    {stdio:['ignore','pipe','pipe'],timeout:15000});
const log = readFileSync(join(out, 'uart.log'), 'utf8');
const manifest = JSON.parse(readFileSync(join(scratch, 'system.json'), 'utf8'));
delete manifest.worlds[0].claims;
writeFileSync(join(scratch, 'system.json'), JSON.stringify(manifest));
const deniedOutput = join(scratch, 'denied');
execFileSync(host, ['-vv', '-j', scratch, '-o', deniedOutput, '-f', fsRoot, '-t', '1000'],
    {stdio:['ignore','pipe','pipe'],timeout:15000});
const denied = readFileSync(join(deniedOutput, 'uart.log'), 'utf8');
assert.match(denied, /Agenda could not start its notes read/);
assert.doesNotMatch(denied, /AGENDA_FRAME/);
assert.doesNotMatch(log, /crashed/);
const jsonLine = key => JSON.parse(log.match(new RegExp(key + ' (.+)$','m'))[1]);
assert.deepEqual(jsonLine('AGENDA_REPLY'),
    {title:'dentist 🦷',done:false,dateValid:true,timeValid:true,leadMinutes:15});
const initialList = jsonLine('AGENDA_FRAME').kids[0];
assert.deepEqual(initialList.items.map(item => item.label),
    ['TUE 3 NOV 2026', '14:30  dentist 🦷', 'NO DATE', 'book a train']);
assert.equal(initialList.sel, 1);
assert.match(log, /agenda-wasm: \d+ WebAssembly instructions \(event 4\)/);
assert.deepEqual(jsonLine('AGENDA_ENGINE'), ['wasm','idle','app']);
assert.match(log, /AGENDA_REJECT expected a bounded Agenda line/);
writeFileSync(join(scratch, 'system.json'), JSON.stringify({worlds: [
    {...manifest.worlds[0], claims:['fs:/notes']}, ...manifest.worlds.slice(1),
]}));
const zone = 'EST5EDT,M3.2.0/2,M11.1.0/2';
const journal = join(scratch, 'store');
mkdirSync(journal);
const reminderLog = (name, wall, duration) => {
    const output = join(scratch, name);
    execFileSync(host, ['-vv', '-j', scratch, '-o', output, '-f', fsRoot, '-s', journal,
        '-w', wall, '-z', zone, '-t', String(duration)], {stdio:['ignore','pipe','pipe'],timeout:15000});
    return readFileSync(join(output, 'uart.log'), 'utf8');
};
const before = reminderLog('before', '2026-11-03T14:14:59', 999);
assert.doesNotMatch(before, /AGENDA_NOTICE/);
const timed = reminderLog('timed', '2026-11-03T14:14:59', 33000);
assert.doesNotMatch(timed, /crashed/);
const notices = [...timed.matchAll(/AGENDA_NOTICE (.+)$/gm)].map(row => JSON.parse(row[1]));
const scheduled = Date.UTC(2026, 10, 3, 19, 15);
assert.equal(notices.length, 1);
const [notice, sender, firedAt] = notices[0];
assert.deepEqual(notice, {text:'dentist 🦷 at 14:30', sub:'in 15m'});
assert.equal(sender, 'agenda-wasm');
assert(firedAt >= scheduled && firedAt < scheduled + 15000);
const firedRecord = JSON.parse(readFileSync(join(journal, 'w', 'agenda-wasm'), 'utf8'));
assert(firedRecord.fired[scheduled + '|dentist 🦷'] >= scheduled);
const rerun = reminderLog('restart', '2026-11-03T14:16:00', 16000);
assert.match(rerun, /AGENDA_FRAME/);
assert.doesNotMatch(rerun, /AGENDA_NOTICE/);
assert.doesNotMatch(reminderLog('unset', 'unset', 16000), /AGENDA_NOTICE/);
// At the autumn transition, the earlier 01:30 is still in daylight time.
writeFileSync(join(fsRoot, 'notes/todo.txt'), '- [ ] transition @2026-11-01 01:30 !15m\n');
const transitionLog = reminderLog('transition', '2026-11-01T00:59:59', 925000);
const transition = [...transitionLog.matchAll(/AGENDA_NOTICE (.+)$/gm)].map(row => JSON.parse(row[1]));
const transitionScheduled = Date.UTC(2026, 10, 1, 5, 15);
assert.equal(transition.length, 1);
assert.equal(transition[0][0].text, 'transition at 01:30');
assert(transition[0][2] >= transitionScheduled && transition[0][2] < transitionScheduled + 15000);
// Check the real compositor and its display driver, separately from frame messages.
const displayWorlds = JSON.parse(readFileSync(join(os, 'js/system.json'), 'utf8')).worlds
    .filter(world => ['keyboard', 'display', 'compositor', 'launcher'].includes(world.name));
for (const world of displayWorlds) {
    mkdirSync(join(scratch, world.file.split('/')[0]), {recursive:true});
    writeFileSync(join(scratch, world.file), readFileSync(join(os, 'js', world.file)));
}
writeFileSync(join(scratch, 'focus.js'), `
service("focus").onStart(async () => {
    await sleep(600);
    send("compositor", "open", {app:"agenda-wasm"});
});
`);
writeFileSync(join(scratch, 'system.json'), JSON.stringify({worlds:[
    ...displayWorlds, {...manifest.worlds[0], claims:['fs:/notes']}, {name:'focus',file:'focus.js',mem_kb:384},
]}));
writeFileSync(join(fsRoot, 'notes/todo.txt'), '- [ ] dentist 🦷 @2026-11-03 14:30 !15m\n- book a train\n');
const displayScript = join(scratch, 'display.txt');
const displayOutput = join(scratch, 'display');
writeFileSync(displayScript, 'wait 400\ncapture launcher.png\nwait 1200\ncapture typed-agenda.png\n');
execFileSync(host, ['-j', scratch, '-o', displayOutput, '-f', fsRoot, displayScript],
    {stdio:['ignore','pipe','pipe'],timeout:15000});
const launcher = readFileSync(join(displayOutput, 'launcher.png'));
const screenshot = readFileSync(join(displayOutput, 'typed-agenda.png'));
assert.equal(screenshot.subarray(1,4).toString(), 'PNG');
assert.notEqual(sha(launcher), sha(screenshot));
if (process.argv[3]) writeFileSync(resolve(process.argv[3]), screenshot);
const seededNotes = '# keep this heading\n- book a train';
const submit = (root, input) => {
    writeFileSync(displayScript, 'wait 1700\nkey f2\nwait 300\n' +
        'type ' + input + '\nwait 2800\nkey enter\nwait 1000\n');
    execFileSync(host, ['-j', scratch, '-o', displayOutput, '-f', root, '-w', '2026-11-01T09:41:00', '-z', zone, displayScript],
        {stdio:['ignore','pipe','pipe'],timeout:15000});
};
writeFileSync(join(fsRoot, 'notes/todo.txt'), seededNotes);
submit(fsRoot, 'dentist @tue 2pm !15m');
const savedNotes = readFileSync(join(fsRoot, 'notes/todo.txt'), 'utf8');
assert.equal(savedNotes, seededNotes + '\n- [ ] dentist @2026-11-03 14:00 !15m\n');
submit(fsRoot, 'invalid @tue 25:00');
assert.equal(readFileSync(join(fsRoot, 'notes/todo.txt'), 'utf8'), savedNotes);
const fresh = join(scratch, 'empty-fs');
mkdirSync(join(fresh, 'notes'), {recursive:true});
submit(fresh, 'first task');
assert.equal(readFileSync(join(fresh, 'notes/todo.txt'), 'utf8'), '- [ ] first task\n');
// Drive the same keys through the real compositor in separate original/typed runs.
const groupFixture = [
    '- [ ] first undated', '- [x] first done', '- [ ] later @2027-01-03',
    '- [ ] timed @2026-11-01 15:30 !15m', '- [ ] untimed @2026-11-01',
    '- [ ] time tie @2026-11-01 15:30 !0m', '- [ ] earlier time @2026-11-01 12:00',
    '- [ ] tomato @2026-11-02', '- [ ] yesterday @2026-10-31 09:00',
    '- [X] second done @2026-11-01', '- [ ] last undated', '',
].join('\n');
writeFileSync(join(scratch, 'agenda.js'), readFileSync(join(os, 'js/apps/agenda.js')));
const groupFrames = (name, text, keys, compact = false) => {
    const world = name === 'agenda' ? {...manifest.worlds[0], name, file:'agenda.js', engine:'js'} : manifest.worlds[0];
    writeFileSync(join(scratch, 'focus.js'), `
service("focus").needs("frames").on("frames", (s, frame, msg) => {
    if (msg.from !== "${name}") return;
    const list = frame.frame.tree.kids[0];
    if (list.t !== "list") return;
    const rows = list.items.map(i => [i.label, i.icon, i.right, i.color, i.rightColor, i.iconColor]);
    log("AGENDA_GROUP " + JSON.stringify(${compact ? 'list.items[list.sel].label' : '[list.sel, rows]'}));
}).onStart(async () => {
    await sleep(600);
    send("compositor", "open", {app:"${name}"});
});
`);
    writeFileSync(join(scratch, 'system.json'), JSON.stringify({worlds:[
        ...displayWorlds, {...world, claims:['fs:/notes']},
        {name:'focus', file:'focus.js', claims:['frames.read'], mem_kb:384},
    ]}));
    writeFileSync(join(fsRoot, 'notes/todo.txt'), text);
    const captureGroup = name === 'agenda-wasm' && text === groupFixture && process.argv[4];
    const steps = keys.map((key, i) => `key ${key}\nwait 220\n` +
        (captureGroup && i === 7 ? 'capture grouped-agenda.png\n' : ''));
    writeFileSync(displayScript, 'wait 1700\n' + steps.join(''));
    const output = join(scratch, 'group-' + name + (compact ? '-long' : ''));
    execFileSync(host, ['-j', scratch, '-o', output, '-f', fsRoot, '-w', '2026-11-01T09:41:00', '-z', zone, displayScript],
        {stdio:['ignore','pipe','pipe'],timeout:15000});
    if (captureGroup) writeFileSync(resolve(process.argv[4]), readFileSync(join(output, 'grouped-agenda.png')));
    const uart = readFileSync(join(output, 'uart.log'), 'utf8');
    assert.doesNotMatch(uart, /crashed/);
    const frames = [...uart.matchAll(/AGENDA_GROUP (.+)$/gm)].map(row => JSON.parse(row[1]));
    return frames.filter((frame, i) => !i || JSON.stringify(frame) !== JSON.stringify(frames[i - 1]));
};
const keys = ['up', 'down', 'down', 'down', 'down', 'down', 'down', 'f4', 'down', 'down', 'down', 'down', 'f4', 'up'];
const groups = groupFrames('agenda-wasm', groupFixture, keys);
assert(groups.length >= 12, 'keyboard actions produced distinct frames');
assert.deepEqual(groups, groupFrames('agenda', groupFixture, keys));
const doneOnly = '- [x] finished\n';
const doneKeys = ['f4', 'down', 'up', 'f4', 'f4', 'up'];
const doneFrames = groupFrames('agenda-wasm', doneOnly, doneKeys);
assert.deepEqual(doneFrames, groupFrames('agenda', doneOnly, doneKeys));
assert.deepEqual(doneFrames.map(frame => frame[0]), [-1, 1, -1, 1]);
const manyTasks = Array.from({length: 48}, (_, i) => '- task ' + (i + 1)).join('\n');
const manySelected = groupFrames('agenda-wasm', manyTasks, Array(52).fill('down'), true);
assert.deepEqual(manySelected, Array.from({length:48}, (_, i) => 'task ' + (i + 1)));

// Compare exact resulting file bytes through both apps, including a competing writer.
const editCases = [
    {name:'toggle', before:'# head\n\t- plain 🦷\nnon-task\n- [ ] keep', commands:'key space',
        after:'# head\n\t- [x] plain 🦷\nnon-task\n- [ ] keep'},
    {name:'edit', before:'# head\n  - [X] rewrite 🦷', commands:'key f4\nwait 300\nkey down\nwait 300\nkey f3\nwait 300\nkey backspace\nwait 300\ntype name @tom 2pm\nwait 2000\nkey enter',
        after:'# head\n  - [x] rewrite name @2026-11-02 14:00'},
    {name:'duplicate-delete', before:'# head\n- same\n# keep\n- same\n- last\n',
        commands:'key down\nwait 300\nkey f5\nwait 400\nkey f5',
        after:'# head\n# keep\n- same\n- last\n', note:'Deleted.'},
    {name:'delete-last', before:'# head\n- last', commands:'key f5\nwait 400\nkey f5',
        after:'# head', note:'Deleted.'},
    {name:'single-delete-key', before:'- keep\n', commands:'key f5\nwait 500\nkey up\nwait 500\nkey f5',
        after:'- keep\n', note:'F5 again deletes: keep'},
    {name:'edit-conflict', before:'- old\n- keep\n', commands:'key f3\nwait 1500\nkey enter',
        competing:'- changed outside Agenda\n- keep\n', after:'- changed outside Agenda\n- keep\n',
        note:'todo.txt changed meanwhile; reloaded.'},
];
const editResult = (name, edit) => {
    const world = name === 'agenda' ? {...manifest.worlds[0], name, file:'agenda.js', engine:'js'} : manifest.worlds[0];
    writeFileSync(join(scratch, 'focus.js'), `
service("focus").needs("frames").on("frames", (s, frame, msg) => {
    if (msg.from !== "${name}") return;
    const kids = frame.frame.tree.kids;
    log("AGENDA_STATUS " + JSON.stringify(kids[kids.length - 1].s));
}).onStart(async () => {
    await sleep(600);
    send("compositor", "open", {app:"${name}"});
    ${edit.competing ? `await sleep(2000); await hw.fs("fs:/notes").write("todo.txt", ${JSON.stringify(edit.competing)});` : ''}
});
`);
    writeFileSync(join(scratch, 'system.json'), JSON.stringify({worlds:[
        ...displayWorlds, {...world, claims:['fs:/notes']},
        {name:'focus',file:'focus.js',claims:['frames.read','fs:/notes'],mem_kb:384},
    ]}));
    const notePath = join(fsRoot, 'notes/todo.txt');
    writeFileSync(notePath, edit.before);
    writeFileSync(displayScript, 'wait 1700\n' + edit.commands + '\nwait 1500\n');
    const output = join(scratch, 'edit-' + name + '-' + edit.name);
    execFileSync(host, ['-j', scratch, '-o', output, '-f', fsRoot, '-w', '2026-11-01T09:41:00', '-z', zone, displayScript],
        {stdio:['ignore','pipe','pipe'],timeout:15000});
    const uart = readFileSync(join(output, 'uart.log'), 'utf8');
    assert.doesNotMatch(uart, /crashed/);
    const status = [...uart.matchAll(/AGENDA_STATUS (.+)$/gm)].map(row => JSON.parse(row[1]));
    return {text:readFileSync(notePath, 'utf8'), note: edit.note ? status.at(-1) : undefined};
};
for (const edit of editCases) {
    const expected = {text:edit.after, note:edit.note};
    assert.deepEqual(editResult('agenda', edit), expected, 'original: ' + edit.name);
    assert.deepEqual(editResult('agenda-wasm', edit), expected, 'typed Wasm: ' + edit.name);
}
const instructions = [...log.matchAll(/agenda-wasm: (\d+) WebAssembly instructions \(event 0, agenda.parse\)/g)]
    .map(match => Number(match[1]));
assert.equal(instructions.length, 2);
console.log(JSON.stringify({linkedBytes:bytes.length, sourceSha:sha(source), runtimeSha:sha(object),
    linkedSha:sha(bytes), reply:jsonLine('AGENDA_REPLY'), frame:jsonLine('AGENDA_FRAME'),
    engine:jsonLine('AGENDA_ENGINE'), deniedWithoutNotesClaim:true, perMessageInstructions:instructions,
    screenshot:{sha256:sha(screenshot), bytes:screenshot.length},
    taskEntry:{savedNotes, invalidPromptUnchanged:true, createsMissingFile:true},
    taskView:{matchesOriginalGroupedFrames:groups.length, matchesOriginalDoneOnlyFrames:doneFrames.length,
        scrollableTasks:manySelected.length},
    mutations:editCases.map(({name}) => name),
    reminder:{notice, sender, scheduled, firedAt, persisted:firedRecord, restartSuppressed:true, unsetSuppressed:true, zone, transitionScheduled, transitionFiredAt:transition[0][2]}}, null, 2));
