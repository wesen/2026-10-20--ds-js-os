import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {arch, cpus, platform} from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const studies = resolve(here, '../../..');
const study = prefix => join(studies, readdirSync(studies).find(path => path.startsWith(prefix + '--')));
const binary = study('PICOCALC-RENDER-BINARY');
const system = study('PICOCALC-RENDER-SYSTEM');
const [engine = 'node', output] = process.argv.slice(2);
if (!output || !['node', 'quickjs', 'resident', 'resident-generic', 'resident-released'].includes(engine)) {
    throw Error('usage: node 03-run.mjs node|quickjs|resident|resident-generic|resident-released OUTPUT');
}
const hash = text => createHash('sha256').update(text).digest('hex');
const inputs = {
    sysmon: [join(system, 'various/sysmon-generic.ndjson'), 55],
    chess: [join(binary, 'various/traces/chess.ndjson.gz'), 23],
    snake: [join(binary, 'various/traces/snake.ndjson.gz'), 118],
    editor: [join(binary, 'various/traces/editor.ndjson.gz'), 22],
    keys: [join(system, 'various/keys-generic.ndjson'), 0],
};
const corpus = {}, manifest = {};
for (const [app, [file, cut]] of Object.entries(inputs)) {
    const input = readFileSync(file);
    const content = file.endsWith('.gz') ? gunzipSync(input).toString() : input.toString();
    const rows = content.trimEnd().split('\n').map(line => {
        const {id, app, title, tree, hints} = JSON.parse(line);
        return {id, payload: {app, title, frame: {tree, hints: hints || ''}}};
    });
    const trained = new Set(rows.slice(0, cut).map(row => hash(JSON.stringify(row.payload))));
    manifest[app] = {rows: rows.length, prefix: cut, holdout: rows.length - cut, sourceSha256: hash(input),
        holdoutDistinct: new Set(rows.slice(cut).map(row => hash(JSON.stringify(row.payload)))).size,
        holdoutUpdatesWithNewPayload: rows.slice(cut).filter(row => !trained.has(hash(JSON.stringify(row.payload)))).length,
        firstHoldout: rows[cut].id, lastHoldout: rows.at(-1).id};
    corpus[app] = {cut, rows};
}

// Expose existing pure codec helpers without changing its baseline encoder body.
const marker = 'return Object.freeze({encode, admit, limits, checkValue, version: 1});';
const original = readFileSync(join(binary, 'scripts/02-binary-screen.js'), 'utf8');
if (!original.includes(marker)) throw Error('PSIX helper export anchor changed');
const codec = original.replace(marker, 'return Object.freeze({encode, admit, limits, checkValue, version: 1, experiment: {smallInt, emitUTF8, compareBytes}});');
const capsule = codec + '\n' +
    readFileSync(join(here, '01-observed-shapes.js'), 'utf8') + '\n' +
    readFileSync(join(here, '02-replay.js'), 'utf8') + '\n' +
    'const runtimeCorpus = JSON.parse(' + JSON.stringify(JSON.stringify(corpus)) + ');\n' +
    'const runtimeManifest = ' + JSON.stringify(manifest) + ';\n' +
    'const runtimeEngine = ' + JSON.stringify(engine === 'node' ? process.version : 'vendored QuickJS host') + ';\n' +
    'const runtimeMode = ' + JSON.stringify(engine) + ';\n' +
    'const runtimeEnvironment = ' + JSON.stringify({host: platform() + '/' + arch(), cpu: cpus()[0]?.model,
        node: process.version, referenceSha256: hash(original)}) + ';\n';
if (engine === 'node') {
    const run = new Function('labMicros', capsule + '\nreturn renderLabRun();');
    const receipt = JSON.parse(run(() => performance.now() * 1000));
    writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
} else {
    writeFileSync(output, capsule);
}
