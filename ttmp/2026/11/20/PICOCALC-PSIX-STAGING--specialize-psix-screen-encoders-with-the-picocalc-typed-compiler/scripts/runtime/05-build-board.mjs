import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const [output] = process.argv.slice(2);
if (!output) throw Error('usage: node 05-build-board.mjs OUTPUT.js');
const here = dirname(fileURLToPath(import.meta.url));
const studies = resolve(here, '../../..');
const study = prefix => join(studies, readdirSync(studies).find(path => path.startsWith(prefix + '--')));
const system = study('PICOCALC-RENDER-SYSTEM');
const binary = study('PICOCALC-RENDER-BINARY');
const select = (file, ids) => {
    const rows = readFileSync(join(system, 'various', file), 'utf8').trimEnd().split('\n').map(line => JSON.parse(line));
    return ids.map(id => {
        const row = rows.find(item => item.id === id);
        if (!row) throw Error('No such fixture ' + id);
        const {app, title, tree, hints} = row;
        return {id, payload: {app, title, frame: {tree, hints: hints || ''}}};
    });
};
const train = select('sysmon-generic.ndjson', ['worlds-first', 'worlds-selection', 'handles-first',
    'handles-last', 'buses-first', 'refresh-0', 'refresh-1', 'refresh-2']);
const tests = {
    system: select('sysmon-generic.ndjson', ['refresh-35', 'refresh-36', 'refresh-37', 'refresh-38', 'refresh-39',
        'refresh-40', 'select-0', 'title-4', 'switch-1']),
    keys: select('keys-generic.ndjson', ['start-0', 'tick-2', 'key-5', 'key-16', 'key-22', 'focus-25']),
};
const original = readFileSync(join(binary, 'scripts/02-binary-screen.js'), 'utf8');
const marker = 'return Object.freeze({encode, admit, limits, checkValue, version: 1});';
if (!original.includes(marker)) throw Error('PSIX helper export anchor changed');
const codec = original.replace(marker, 'return Object.freeze({encode, admit, limits, checkValue, version: 1, experiment: {smallInt, emitUTF8, compareBytes}});');
const corpus = JSON.stringify({train, tests});
const source = '(function(){\n' + codec + '\n' +
    readFileSync(join(here, '01-observed-shapes.js'), 'utf8') + '\n' +
    'const fixtures=JSON.parse(' + JSON.stringify(corpus) + ');\n' +
    readFileSync(join(here, '06-board.js'), 'utf8') + '\n})();\n';
writeFileSync(output, source);
const engine = {stageMicros: () => performance.now() * 1000};
vm.runInNewContext(source, engine);
const receipts = Object.fromEntries(Object.keys(tests).map(app => {
    const {count, bytes, wireHash, verified} = engine.stageAdaptiveRun('verify-' + app);
    return [app, {validation: {count, bytes, wireHash, verified}, frames: tests[app].map(row => row.id)}];
}));
writeFileSync(output + '.json', JSON.stringify({
    sourceBytes: Buffer.byteLength(source),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    training: train.map(row => row.id),
    tests: receipts,
}, null, 2) + '\n');
