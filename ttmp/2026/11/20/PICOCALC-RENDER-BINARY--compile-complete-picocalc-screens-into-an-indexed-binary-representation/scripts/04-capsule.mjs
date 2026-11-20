import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const compositor = join(root, 'picocalc-os/js/system/compositor.js');

function widestScalars(root) {
    let best;
    function visit(value, path) {
        if (value === null || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            if (value.length > (best?.count || 0)) {
                const first = scalarSuffix(value[0]);
                const last = scalarSuffix(value[value.length - 1]);
                if (first && last) best = {count: value.length,
                    first: [...path, 0, ...first], last: [...path, value.length - 1, ...last]};
            }
            value.forEach((item, index) => visit(item, [...path, index]));
        } else {
            for (const key of Object.keys(value)) visit(value[key], [...path, key]);
        }
    }
    visit(root, ['frame', 'tree']);
    return best;
}
function scalarSuffix(value) {
    if (value === null || typeof value !== 'object') return [];
    for (const key of Object.keys(value)) {
        const rest = scalarSuffix(value[key]);
        if (rest) return [Array.isArray(value) ? Number(key) : key, ...rest];
    }
    return null;
}
function fixture(filename) {
    const rows = readFileSync(filename, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const eligible = rows.flatMap((r, i) => {
        const selected = widestScalars(r.tree);
        if (!selected) return [];
        const payload = {app: r.app, title: r.title, frame: {tree: r.tree, hints: r.hints || ''}};
        return [{i, bytes: Buffer.byteLength(JSON.stringify(payload)), fixture: {id: r.id, payload,
            path: selected.last, firstPath: selected.first, indexedItems: selected.count,
            battery: r.battery ?? null, banner: r.banner ?? null}}];
    }).sort((a, b) => a.bytes - b.bytes || a.i - b.i);
    if (!eligible.length) throw Error('No eligible screen in ' + filename);
    return eligible[Math.floor(eligible.length / 2)].fixture;
}
function painter(fontFile) {
    const source = readFileSync(compositor, 'utf8');
    const end = source.indexOf('// Notifications from any world');
    if (end < 0) throw Error('Paint boundary changed');
    const actual = source.slice(0, end);
    const checked = actual.replace('catch (e) {   // a malformed tree', 'catch (e) { throw e;   // a malformed tree');
    if (checked === actual) throw Error('Paint error hook changed');
    const fonts = JSON.parse(readFileSync(fontFile, 'utf8'));
    return checked + '\nF=' + JSON.stringify(fonts) + ';\nconst clock={set:()=>false};\n';
}

const [fontFile, output, ...inputs] = process.argv.slice(2);
if (!output || inputs.length < 3 || inputs.length > 4) throw Error('usage: 04-capsule.mjs fonts.json output.js sysmon.ndjson chess.ndjson snake.ndjson [editor.ndjson]');
const fixtures = Object.fromEntries(inputs.map(filename => {
    const f = fixture(filename);
    return [f.payload.app, f];
}));
if (new Set(Object.keys(fixtures)).size !== inputs.length) throw Error('Input traces must belong to distinct apps');
const source = readFileSync(join(here, '02-binary-screen.js'), 'utf8') + '\n' + painter(fontFile) +
    readFileSync(join(here, '03-trial.js'), 'utf8') + '\nconst binaryFixtures=' + JSON.stringify(fixtures) + ';\n';
writeFileSync(output, source);
const hash = value => createHash('sha256').update(value).digest('hex');
const receipt = Object.fromEntries(Object.entries(fixtures).map(([app, {payload, ...f}]) =>
    [app, {...f, payloadSha256: hash(JSON.stringify(payload))}]));
writeFileSync(output + '.json', JSON.stringify({capsuleBytes: Buffer.byteLength(source), capsuleSha256: hash(source), fixtures: receipt}, null, 2) + '\n');
