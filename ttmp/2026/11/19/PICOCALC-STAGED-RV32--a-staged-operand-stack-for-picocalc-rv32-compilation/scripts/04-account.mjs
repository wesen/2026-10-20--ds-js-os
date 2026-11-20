// Count candidate images one app at a time, or run only the frozen historical estimator.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext, runInContext} from 'node:vm';
import {walk} from './03-historical-model.mjs';

const control = '40bcf850a5809ef6d839127869faa952596ed157';
const hash = data => createHash('sha256').update(data).digest('hex');
const lanes = ['base', 'fusion', 'short', 'operands', 'leaf', 'staged'];
const apps = {
    files: {parts: ['files.typed'], limit: 64 * 1024},
    agenda: {parts: ['reminder.typed', 'entry.typed'], limit: 64 * 1024},
    editor: {limit: 96 * 1024},
};
const [app, work, option] = process.argv.slice(2);
assert(Object.hasOwn(apps, app) && work && (!option || option === '--model-only'),
    'Usage: node 04-account.mjs files|agenda|editor <staged-directory> [--model-only]');
const {limit} = apps[app];
const source = readFileSync(join(work, 'sources', app, 'app.typed'), 'utf8');
const baseCompiler = part => readFileSync(join(work, 'lanes', 'base', 'typed', `${part}.js`), 'utf8');
const imported = app !== 'editor' ? [] : [...baseCompiler('world').matchAll(/\["(typedSdk\w+)", "([^"]*)", "(\w+)"\]/g)]
    .map(([, name, params, result], index) => ({name, params: params ? params.split(',') : [], result, index}));
if (app === 'editor') assert.equal(imported.length, 28);
const context = createContext();
runInContext(baseCompiler('wasm'), context);
const {functions} = context.typedWasm.compileFunctions(source, imported.length, imported, limit);
const callables = [...imported, ...functions];
const rows = functions.map(fn => {
    const {cost, detail} = walk(fn, callables);
    return {name: fn.name, model: cost.A, ...detail};
});
const totals = {model: rows.reduce((total, row) => total + row.model, 0)};
const images = {};
if (!option) {
    for (const lane of lanes) {
        const script = readFileSync(join(work, 'lanes', lane, 'typed', 'rv32.js'), 'utf8');
        runInContext(script, context);
        const streamed = context.typedRv32.compile(source, imported, limit);
        const buffered = context.typedRv32.compile(source, imported, limit, {streamFunctions: false});
        assert.deepEqual(streamed, buffered, `${app} ${lane} streamed/buffered mismatch`);
        totals[lane] = streamed.image.length / 4;
        images[lane] = {sha256: hash(streamed.image), bytes: streamed.image.length, imports: streamed.relocations.length};
        for (const [i, row] of rows.entries()) {
            const end = streamed.entries[rows[i + 1]?.name] ?? streamed.image.length;
            row[lane] = (end - streamed.entries[row.name]) / 4;
        }
        assert.equal(rows.reduce((total, row) => total + row[lane], 0), totals[lane]);
    }
    for (const row of rows) row.residual = row.staged - row.model;
}
console.log(JSON.stringify({app, control, node: process.version, sourceSha256: hash(source), totals, images, rows}, null, 2));
