// Promoted from PICOCALC-AGENDA-COMPILER scripts/03-check-task-records.mjs (PICOCALC-REPO-LAYOUT Phase A); run from the repository root.
import fs from 'node:fs';
import {agendaLines} from './agenda-lines.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import '../../lib/compiler.mjs';

const original = fs.readFileSync('apps/js/picocalc/apps/agenda.js', 'utf8');
const parse = vm.runInNewContext(original.slice(0, original.indexOf('function agToggled')) + '\nagParse');
const source = fs.readFileSync('apps/typed/agenda/state.typed', 'utf8') + fs.readFileSync('apps/typed/agenda/reminder.typed', 'utf8');
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
    const task = Object.fromEntries(Object.entries(records.WorldState).filter(([name]) => name.startsWith('task')).map(([name, field]) =>
        [name[4].toLowerCase() + name.slice(5), data.getInt32(record + field.offset, true)]));
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
for (const line of agendaLines()) compare(line);
assert.throws(() => compileTyped('record R { completed: bool; }\nfunction run(r: R): bool { r.completed = 7; return true; }'), /2:\d+: expected bool, got i32/);
assert.throws(() => compileTyped('record R { completed: bool; }\nfunction run(r: R): bool { return r.missing; }'), /2:\d+: unknown field R.missing/);
console.log(JSON.stringify({cases, diagnosticCases: 2, wasmBytes: bytes.length}));
