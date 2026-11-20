// Count current-token text materialization during actual app compilation.
// Use instrumented host copies and verify the generated ELFs for every run.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [work] = process.argv.slice(2);
const image = join(work, 'lazy');
const os = join(image, 'tree/picocalc-os');
const reactors = join(image, 'build/esp-idf/main');
const receipt = JSON.parse(readFileSync(join(work, 'verified-images.json')));
const text = path => readFileSync(path, 'utf8');
const appInputs = {
    files: [text(join(os, 'worlds/files/files.typed')), 'files-reactor', 'compileFilesRv32'],
    agenda: [['reminder', 'entry'].map(name => text(join(os, 'worlds/agenda', name + '.typed'))).join('\n'),
        'agenda-reactor', 'compileAgendaRv32'],
    editor: [text(join(reactors, 'editor.typed')), 'typed-world-reactor', 'compileTypedWorldRv32'],
};

function replace(source, old, replacement) {
    assert.equal(source.split(old).length, 2);
    return source.replace(old, replacement);
}

function instrument(source, lazy) {
    const cursorEnd = '        this.offset = end;\n    }\n\n    legacyNext() {';
    source = replace(source, cursorEnd, '        counts.cursorTokens++;\n' + cursorEnd);
    const fallbackMatch = '        const match = TOKEN.exec(this.source);\n        if (match) {';
    source = replace(source, fallbackMatch, fallbackMatch + '\n            counts.fallbackMatches++;');
    return lazy
        ? replace(source, '            this.tokenText = this.source.slice(this.token.at, this.token.end);',
            '            this.tokenText = countedSlice(this.source, this.token.at, this.token.end, this.token.kind);')
        : replace(source, '        this.token.value = source.slice(start, end);',
            '        this.token.value = countedSlice(source, start, end, kind);');
}

const runs = {};
for (const [app, [src, reactor, entry]] of Object.entries(appInputs)) {
    runs[app] = {};
    for (const lane of ['cursor_reuse', 'cursor_lazy']) {
        const dir = join(image, 'lanes', lane, 'typed');
        const counts = {cursorTokens: 0, fallbackMatches: 0, slices: 0, unitsInSlices: 0, byKind: {}};
        const context = vm.createContext({counts, countedSlice(string, start, end, kind) {
            counts.slices++;
            counts.unitsInSlices += end - start;
            counts.byKind[kind] = (counts.byKind[kind] ?? 0) + 1;
            return string.slice(start, end);
        }});
        vm.runInContext(instrument(text(join(dir, 'wasm.js')), lane === 'cursor_lazy'), context);
        for (const path of [join(dir, 'rv32.js'), ...[
            'compiler/typed-world.js', 'worlds/files/compile.js', 'worlds/agenda/compile.js',
        ].map(file => join(os, file))]) vm.runInContext(text(path), context);
        const native = new Uint8Array(readFileSync(join(reactors, reactor + '.elf')));
        const module = context[entry](src, native);
        const digest = createHash('sha256').update(module).digest('hex');
        assert.equal(digest, receipt.images.lazy.identities[app].elf);
        runs[app][lane] = counts;
    }
    const {cursor_reuse: eager, cursor_lazy: lazy} = runs[app];
    assert.equal(eager.cursorTokens, lazy.cursorTokens);
    assert.equal(eager.fallbackMatches, lazy.fallbackMatches);
    assert.equal(eager.cursorTokens, eager.slices);
    assert(lazy.slices < eager.slices);
    assert(!lazy.byKind.op, 'native parser unexpectedly requested operator text');
}
console.log(JSON.stringify(runs, null, 2));
