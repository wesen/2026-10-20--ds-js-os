import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

// Use the retained fixture from 02-check-editor-world.mjs --large --keep-fixture.
const [fixture, output] = process.argv.slice(2, 4).map(path => resolve(path));
const adversarial = process.argv.includes('--adversarial');
const afterMatch = process.argv.includes('--after-match');
assert(fixture && output, 'pass the retained large fixture directory and an output directory');
mkdirSync(output);

const full = ('text '.repeat(15) + '\r\n').repeat(851) + 'x'.repeat(9);
const preview = ('A reading paragraph, followed by a blank line.\n\n').repeat(450) + 'END OF PREVIEW';
function query(value) {
    return ['key f3', 'wait 530', 'type ' + value, 'wait 530', 'key enter', 'wait 1800'];
}

const tail = full.slice(0, -9) + 'needlezzz';
const trials = afterMatch ? {
    'tail-right': {text:tail, commands:[...query('needle'), 'key right', 'wait 1000'], marker:'entry.txt  852:2'},
    'tail-up': {text:tail, commands:[...query('needle'), 'key up', 'wait 1000'], marker:'entry.txt  851:46'},
} : adversarial ? {
    'find-dense': {text:full, commands:query('text text z'), marker:'Not found: text text z'},
    'find-tail': {text:tail, commands:query('needle'), marker:'entry.txt  852:1'},
} : {
    save: {text:full, commands:['key f2', 'wait 1800'], marker:'Saved 64685 bytes.'},
    find: {text:full, commands:query('zzz'),
        marker:'Not found: zzz'},
    preview: {text:preview, commands:['key f6', 'wait 530',
        ...Array.from({length:57}, () => ['key pgdn', 'wait 530']).flat(), 'wait 1800'],
        marker:'END OF PREVIEW'},
};
const summary = {};
for (const variant of ['js', 'wasm']) for (const [name, trial] of Object.entries(trials)) {
    const root = join(output, variant + '-' + name);
    const fs = join(root, 'fs');
    mkdirSync(fs, {recursive:true});
    const input = join(fixture, variant, 'js'), js = join(root, 'js');
    mkdirSync(js);
    for (const name of readdirSync(input)) {
        if (name !== 'system.json') symlinkSync(join(input, name), join(js, name));
    }
    const manifest = JSON.parse(readFileSync(join(input, 'system.json'), 'utf8'));
    manifest.worlds.find(world => world.name === 'probe').mem_kb = 2048;
    writeFileSync(join(js, 'system.json'), JSON.stringify(manifest));
    const file = join(fs, 'entry.txt');
    writeFileSync(file, trial.text);
    const scenario = join(root, 'keys.txt'), out = join(root, 'out');
    writeFileSync(scenario, ['wait 2000', 'key d', 'wait 530', 'key enter', 'wait 2000', ...trial.commands, ''].join('\n'));
    execFileSync('picocalc-os/build/picocalc-host',
        ['-j', js, '-f', fs, '-o', out, scenario], {encoding:'utf8',timeout:30000});
    const log = readFileSync(join(out, 'uart.log'), 'utf8');
    const frames = log.split('probe: EDITOR_FRAME\n').slice(1)
        .map(block => JSON.parse([...block.matchAll(/EDITOR_PART (.*)$/gm)].map(match => match[1]).join('')));
    const last = frames.at(-1);
    const faults = (log.match(/^.*(?:editor|probe) crashed.*$/gm) ?? []).map(line => line.replace(/^\[[^\]]+\]\s*/, ''));
    const expectedBytes = name === 'save' ? full.replace(/\r\n/g, '\n') : trial.text;
    summary[variant + '/' + name] = {
        input_bytes:Buffer.byteLength(trial.text),
        finished:JSON.stringify(last ?? {}).includes(trial.marker),
        file_bytes_match:readFileSync(file, 'utf8') === expectedBytes,
        faults,
    };
}
writeFileSync(join(output, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
