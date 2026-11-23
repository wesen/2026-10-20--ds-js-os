// Does the manifest's join rule (each source followed by a newline) change Agenda's or Files' RV32 module?
// The old port compiled Agenda as reminder + "\n" + entry and Files as files.typed alone.
// usage (repository root): node ttmp/.../scripts/01-trailing-newline.mjs BASELINE_BUILD/esp-idf/main
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import '../../../../../../bench/lib/compiler.mjs';
import '../../../../../../apps/typed/agenda/compile.js';
import '../../../../../../apps/typed/files/compile.js';

const main = process.argv[2];
assert(main, 'pass the baseline build directory esp-idf/main');
const read = p => readFileSync(p, 'utf8');
const digest = b => createHash('sha256').update(b).digest('hex').slice(0, 16);
const reminder = read('apps/typed/agenda/reminder.typed'), entry = read('apps/typed/agenda/entry.typed');
const files = read('apps/typed/files/files.typed');
const agendaReactor = readFileSync(join(main, 'agenda-reactor.elf')), filesReactor = readFileSync(join(main, 'files-reactor.elf'));
const rows = {
    agendaOld: compileAgendaRv32(reminder + '\n' + entry, agendaReactor, {policy: 'interactive'}),
    agendaNew: compileAgendaRv32(reminder + '\n' + entry + '\n', agendaReactor, {policy: 'interactive'}),
    filesOld: compileFilesRv32(files, filesReactor),
    filesNew: compileFilesRv32(files + '\n', filesReactor),
};
for (const [k, v] of Object.entries(rows)) console.log(k, v.length, digest(v));
console.log('agenda same:', digest(rows.agendaOld) === digest(rows.agendaNew), 'files same:', digest(rows.filesOld) === digest(rows.filesNew));
