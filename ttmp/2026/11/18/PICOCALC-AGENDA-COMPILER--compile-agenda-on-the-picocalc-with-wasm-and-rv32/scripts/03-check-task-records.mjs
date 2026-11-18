import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';

const original = fs.readFileSync('picocalc-os/js/apps/agenda.js', 'utf8');
const parse = vm.runInNewContext(original.slice(0, original.indexOf('function agToggled')) + '\nagParse');
const source = fs.readFileSync('picocalc-os/worlds/agenda/reminder.typed', 'utf8');
const { bytes, records } = typedWasm.compile(source);
const { instance } = await WebAssembly.instantiate(bytes);
const { memory, parseTask } = instance.exports;
const data = new DataView(memory.buffer);
const record = 8192;
const title = 16384;

function compiled(line) {
    data.setUint32(0, line.length, true);
    for (let i = 0; i < line.length; i++) data.setUint16(4 + i * 2, line.charCodeAt(i), true);
    data.setUint32(title, line.length, true);
    if (!parseTask(0, title, record)) return null;
    const task = Object.fromEntries(Object.entries(records.Task).map(([name, field]) =>
        [name, data.getInt32(record + field.offset, true)]));
    let text = '';
    for (let i = 0; i < task.titleLength; i++) text += String.fromCharCode(data.getUint16(title + 4 + i * 2, true));
    return {
        line, done: Boolean(task.done),
        title: text || '(untitled)',
        date: task.dateValid ? line.slice(task.dueStart + 1, task.dueStart + 11) : null,
        time: task.timeValid ? line.slice(task.timeStart, task.timeStart + 5) : null,
        lead: task.leadMinutes >= 0 ? task.leadMinutes : null,
        leadText: task.leadStart >= 0 ? line.slice(task.leadStart, task.leadEnd) : '',
    };
}

let cases = 0;
function compare(line) {
    assert.deepEqual(compiled(line), JSON.parse(JSON.stringify(parse(line))), line);
    cases++;
}
for (const prefix of ['- ', '- [ ] ', '  - [X] ', '\u00a0- [x] ', '- [?] ', '-\t', '# ', '']) {
    for (const first of ['x', 'dentist 🦷', '', '\t', 'before\nafter']) {
        for (const date of ['', '@2026-11-03', '@2026-11-03 14:30', '@2026-11-03\u200014:30',
            '@2026-11-03 24:00', '@2026-02-30', '@2026-11-03 12:30x', '@2000-02-29 @2026-11-03',
            '@2026-11-03,', '@0096-02-29']) {
            for (const lead of ['', '!15m', '!2h', '!0d', '!0001m', '!15m !30m', '!10000m', '!9h,']) {
                compare([prefix + first, date, lead].join(' ').trimEnd());
                compare(prefix + lead + ' ' + date + ' ' + first);
            }
        }
    }
}
for (const line of ['- ', '- [x] ', '- [ ]\n', '- a\n', '- a\r', '- a\u2028', '- a\u2029', '- x!15m', '- x@2026-11-03', '- !1h\t@2026-11-03', '- @2026-11-03\u00a0!1h']) compare(line);
assert.throws(() => compileTyped('record R { completed: bool; }\nfunction run(r: R): bool { r.completed = 7; return true; }'), /2:\d+: expected bool, got i32/);
assert.throws(() => compileTyped('record R { completed: bool; }\nfunction run(r: R): bool { return r.missing; }'), /2:\d+: unknown field R.missing/);
console.log(JSON.stringify({cases, diagnosticCases: 2, wasmBytes: bytes.length}));
