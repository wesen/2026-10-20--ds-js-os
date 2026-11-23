// Link every app's bundled source from two builds' bundles with the same reactors and options, and compare the images:
// the new build's assembled sources (each followed by a newline) must give the old build's modules.
// usage (repository root): node ttmp/.../scripts/04-module-images.mjs OLD_BUILD NEW_BUILD
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {runInThisContext} from 'node:vm';
import '../../../../../../bench/lib/compiler.mjs';

const [oldBuild, newBuild] = process.argv.slice(2);
assert(oldBuild && newBuild, 'pass OLD_BUILD NEW_BUILD');
function bundle(build) {
    const text = readFileSync(join(build, 'esp-idf/main/js_bundle.c'), 'utf8');
    const data = new Map();
    for (const m of text.matchAll(/static const unsigned char (f\d+)\[\] = \{([^}]*)\};/g))
        data.set(m[1], Buffer.from(m[2].split(',').filter(Boolean).map(x => parseInt(x, 16))));
    const files = new Map();
    for (const m of text.matchAll(/\{ "([^"]+)", (f\d+), (\d+) \}/g)) files.set(m[1], data.get(m[2]).subarray(0, Number(m[3])));
    return files;
}
const o = bundle(oldBuild), n = bundle(newBuild);
for (const [path, file] of [['agenda/link.js'], ['files/link.js'], ['raytrace/link.js'], ['chess/painter/link.js'], ['candela/link.js']])
    runInThisContext(n.get(path).toString('utf8'), {filename: path});
const digest = b => createHash('sha256').update(b).digest('hex').slice(0, 16);
const text = (b, path) => b.get(path).toString('utf8');
const rows = [
    ['agenda', () => compileAgendaRv32(text(o, 'agenda/reminder.typed') + '\n' + text(o, 'agenda/entry.typed'), o.get('agenda/reactor.bin'), {policy: 'interactive'}),
               () => compileAgendaRv32(text(n, 'agenda/source.typed'), n.get('agenda/reactor.elf'), {policy: 'interactive'})],
    ['files', () => compileFilesRv32(text(o, 'files/files.typed'), o.get('files/reactor.bin')),
              () => compileFilesRv32(text(n, 'files/source.typed'), n.get('files/reactor.elf'))],
    ['raytrace', () => linkTypedRay(text(o, 'typed-ray/main.typed'), o.get('candela/slot.elf'), {policy: 'kernel'}),
                 () => linkTypedRay(text(n, 'raytrace/source.typed'), n.get('raytrace/reactor.elf'), {policy: 'kernel'})],
];
let same = true;
for (const [name, before, after] of rows) {
    const a = digest(before()), b = digest(after());
    console.log(name, a, b, a === b ? 'same' : 'DIFFERS');
    same &&= a === b;
}
console.log(same ? 'every image is the same' : 'some image differs');
process.exitCode = same ? 0 : 1;
