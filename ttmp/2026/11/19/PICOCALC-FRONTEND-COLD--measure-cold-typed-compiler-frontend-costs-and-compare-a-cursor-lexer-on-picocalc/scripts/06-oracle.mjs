// Check lexer behavior and compare actual native app outputs and standalone Wasm output.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [work, reactorDir = join(work, 'build/esp-idf/main'), fixture] = process.argv.slice(2);
const world = join(work, 'tree/picocalc-os/worlds');
const sha = data => createHash('sha256').update(data).digest('hex');
const variants = ['base', 'cursor', 'base_trace', 'cursor_trace', 'cursor_fresh'];
const files = ['typed/wasm.js', 'typed/rv32.js', 'typed/world.js', 'agenda/compile.js', 'files/compile.js'];
const contexts = Object.fromEntries(variants.map(variant => {
    const context = vm.createContext({frontPhase() {}});
    for (const file of files) {
        let source = readFileSync(join(work, 'lanes', variant, file), 'utf8');
        if (file === 'typed/wasm.js') {
            source = source.replace('globalThis.compileTyped =', 'globalThis.TestLexer = Lexer;\nglobalThis.compileTyped =');
        }
        vm.runInContext(source, context, {filename: file});
    }
    return [variant, context];
}));

function capture(test) {
    try {
        return {result: test()};
    } catch (error) {
        return {name: error.name, message: error.message};
    }
}

function lexer(context, source) {
    const tokens = [];
    const end = capture(() => {
        const lex = new context.TestLexer(source);
        while (true) {
            const {kind, value, at} = lex.token;
            tokens.push([kind, value, at, lex.offset]);
            if (kind === 'eof') return;
            assert.ok(tokens.length <= source.length);
            lex.next();
        }
    });
    return {tokens, end};
}

let randomState = 0xe91abb1;
function random(limit) {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) % limit;
}

const whitespace = [' ', '\r', '\n', '\r\n', '\t', '\v', '\f', '\u00a0', '\u1680',
    '\u2000', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff'];
const invalidSpace = ['\u0085', '\u180e', '\u200b', '\u200e', '\u2060'];
const symbols = ['===', '==', '=>', '>>', '>=', '>>>', '>>=', '||', '&&', '|', '&',
    '!', '%', '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '{', '}'];
const strings = ['""', '"a/b"', '"//"', '"\\/"', '"\\""', '"\\\\"', '"\\r\\f\\b\\n\\t"',
    '"\\u0000"', '"\\uAbCd"', '"\\ud800"', '"\\uD83D\\uDC69"', '"\u2028\u2029"',
    '"\\x43"', '"\\uab"', '"\\uGGGG"', '"\\q"', '"unterminated', '"\\', '"\n"', '"\u0000"'];
const lexical = ['', 'x   @', 'x  // ignored\u2028still ignored\n   @', 'x  // EOF\r\u2028',
    '\uD800', '\uDC00', '👩', 'ø', '١', '‑', '0', '012', '2147483648',
    'a_z0', '_', 'a'.repeat(65535), '"unterminated' + 'x'.repeat(65535)];
for (const fragment of [...lexical, ...whitespace, ...invalidSpace, ...symbols, ...strings]) {
    lexical.push(fragment, `id ${fragment} next`, `\n// comment\r\n  ${fragment}`);
}
const fragments = [...whitespace, ...invalidSpace, ...symbols, ...strings,
    'x', 'a_0', '456', '2147483648', '// comment', '//\r\n', '@', '👩', '\uD800'];
for (let i = 0; i < 6000; i++) {
    const sample = [];
    for (let j = random(16); j > 0; j--) sample.push(fragments[random(fragments.length)]);
    lexical.push(sample.join(''));
}
for (let i = 0; i <= 0xffff; i++) lexical.push('x ' + String.fromCharCode(i));

for (const source of lexical) {
    const expected = lexer(contexts.base, source);
    for (const variant of variants.slice(1)) {
        assert.deepEqual(lexer(contexts[variant], source), expected,
            `${variant} lexer on ${JSON.stringify(source.slice(0, 100))}`);
    }
}

const simple = 'function answer(a:i32):i32 { return a + 1; }';
const examples = [
    simple,
    'function answer(a:i32):i32 { return a >= 5; }',
    'function negative():i32 { return -2147483648; }',
    'record Pair { field:i32; } function field(p:Pair):i32 { return p.field; }',
    'function literal(output:buffer):i32 { return output.writeLiteral("ok\\t\\u00a0"); }',
    'function first(a:i32):i32 { return a >> 1; } function second():i32 { return first(10); }',
    'function yes(a:i32):bool { return a < 4 && a >= 0 || a === -2; }',
    'function loop(a:i32):i32 { let x:i32 = 0; while (a > x) { x = x + 1; } return x; }',
];
const invalid = ['', '// end', '@', '  \n   @', 'function', 'function answer():i32 { return 2147483648; }',
    'function answer():i32 { return 1; }  ?',
    'function answer():i32 { return true; }',
    'function answer():i32 { return a; }',
    'function answer(a:alien):i32 { return 1; }',
    'function answer(output:buffer):i32 { return output.writeLiteral("\\x43"); }',
    'function answer(output:buffer):i32 { return output.writeLiteral("x\n"); }',
    'function answer(output:buffer):i32 { return output.writeLiteral("unterminated); }',
    'record Broken { name:i32; name:i32; } ' + simple,
    simple + simple,
];
const mutations = [];
for (let i = 0; i < 512; i++) {
    const source = examples[random(examples.length)];
    const at = random(source.length + 1);
    mutations.push(source.slice(0, at) + fragments[random(fragments.length)] + source.slice(at + random(4)));
}
const compilationCases = [...examples, ...invalid, ...mutations];

if (fixture) {
    writeFileSync(fixture, [
        capture.toString(), lexer.toString(),
        'const assert = {ok(condition) { if (!condition) throw Error("lexer made no progress"); }};',
        `const lexical = ${JSON.stringify(lexical)};`,
        `const cases = ${JSON.stringify(compilationCases)};`,
        'JSON.stringify({lexical: lexical.map(source => lexer(globalThis, source)),',
        'compilation: cases.map(source => [',
        'capture(() => Array.from(compileTyped(source))),',
        'capture(() => {const {image, ...metadata} = typedRv32.compile(source); return [Array.from(image), metadata];})',
        '])});',
    ].join('\n'));
}

let wasmValid = 0;
let rv32Valid = 0;
for (const source of compilationCases) {
    const results = context => ({
        wasm: capture(() => Buffer.from(context.compileTyped(source)).toString('hex')),
        rv32: capture(() => {
            const {image, ...metadata} = context.typedRv32.compile(source);
            return {image: Buffer.from(image).toString('hex'), metadata: JSON.stringify(metadata)};
        }),
    });
    const expected = results(contexts.base);
    if (expected.wasm.result) wasmValid++;
    if (expected.rv32.result) rv32Valid++;
    for (const variant of variants.slice(1)) assert.deepEqual(results(contexts[variant]), expected,
        `${variant} compiler on ${JSON.stringify(source.slice(0, 200))}`);
}

const apps = {
    files: [readFileSync(join(world, 'files/files.typed'), 'utf8'), 'files-reactor.elf', 'compileFilesRv32'],
    agenda: [['reminder.typed', 'entry.typed'].map(f => readFileSync(join(world, 'agenda', f), 'utf8')).join('\n'),
        'agenda-reactor.elf', 'compileAgendaRv32'],
    editor: [readFileSync(join(reactorDir, 'editor.typed'), 'utf8'), 'typed-world-reactor.elf', 'compileTypedWorldRv32'],
};
const inputs = {};
const outputs = {};
for (const [app, [source, elf, entry]] of Object.entries(apps)) {
    const reactor = readFileSync(join(reactorDir, elf));
    inputs[app] = {sourceSha256: sha(source), reactorSha256: sha(reactor), sourceBytes: Buffer.byteLength(source)};
    outputs[app] = {};
    for (const [variant, context] of Object.entries(contexts)) {
        const compile = context.typedRv32.compile;
        let raw;
        context.typedRv32.compile = (...args) => {
            const {image, ...metadata} = compile(...args);
            raw = {instructionBytes: image.length, rawSha256: sha(image), metadataSha256: sha(JSON.stringify(metadata))};
            return {image, ...metadata};
        };
        // Trace variants annotate streamed compilation only. Clean ones must also
        // produce the same output in the public buffered mode.
        const link = options => {
            const input = new Uint8Array(reactor);
            const image = Buffer.from(context[entry](source, input, options));
            assert.deepEqual(Buffer.from(input), reactor);
            return {...raw, bytes: image.length, sha256: sha(image)};
        };
        const streamed = link(undefined);
        if (!variant.endsWith('_trace')) assert.deepEqual(link({streamFunctions: false}), streamed);
        context.typedRv32.compile = compile;
        outputs[app][variant] = streamed;
        assert.deepEqual(streamed, outputs[app].base, `${app} ${variant}`);
    }
}
console.log(JSON.stringify({
    lexicalCases: lexical.length, compilationCases: compilationCases.length,
    wasmValid, rv32Valid, inputs, outputs,
}, null, 2));
