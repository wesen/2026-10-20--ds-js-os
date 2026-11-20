// Compare token streams, object lifetimes, compiler bytes, metadata and diagnostics.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [work, quickjs] = process.argv.slice(2);
const lanes = ['base', 'regex_reuse', 'cursor_fresh', 'cursor_reuse', 'cursor_lazy'];
const treatments = join(work, 'treatments');
const backend = join(treatments, 'base/typed/rv32.js');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function observe(run) {
    try {
        return {value: run()};
    } catch (error) {
        return {error: [error.name, error.message]};
    }
}

function tokenTrace(source, reuse, lazy) {
    const first = observe(() => new TestLexer(source));
    if (first.error) return [[], first.error];
    const lex = first.value;
    const tuples = [];
    let previous;
    while (true) {
        const token = lex.token;
        if (previous && (previous === token) !== reuse) throw Error('unexpected token identity');
        const {kind, at} = token;
        const end = lazy ? token.end : at + token.value.length;
        if (lazy && ('value' in token || lex.tokenText !== undefined)) throw Error('eager text retained');
        const value = lazy ? lex.text() : token.value;
        tuples.push([kind, value, at, end, lex.offset]);
        if (kind === 'eof') {
            lex.next();
            if ((lex.token === token) !== reuse) throw Error('unexpected EOF identity');
            return [tuples];
        }
        if (tuples.length > source.length) throw Error('scanner stalled');
        previous = token;
        const next = observe(() => lex.next());
        if (next.error) {
            if ((lex.token === token) !== reuse) throw Error('unexpected invalid-token identity');
            return [tuples, next.error];
        }
    }
}

function compileTrace(source) {
    function encode({bytes, image, ...metadata}) {
        return [Array.from(bytes ?? image), metadata];
    }
    return [
        observe(() => encode(typedWasm.compile(source))),
        observe(() => encode(typedRv32.compile(source, [], undefined, {streamFunctions: false}))),
        observe(() => encode(typedRv32.compile(source, [], undefined, {streamFunctions: true}))),
    ];
}

function lexicalCorpus() {
    const fragments = ['//', '\r', '\n', '\u2028', '"', '\\', 'u000a', '\0',
        '>>', '=', '4', 'A', '&', '.', '/', ' '];
    const sources = ['', 'a'.repeat(65536), '"unterminated' + 'x'.repeat(65536),
        'x // terminal comment', '// c\r\nx', 'x // c\u2028still skipped\n\u205f@',
        '"\\ud800\\n\\u0000"', '"a🚀"', '"\\x42"', '"\n"', '\udc00\ud800'];
    for (let i = 0; i <= 0xffff; i++) sources.push('x' + String.fromCharCode(i) + 'y');
    for (const a of fragments) for (const b of fragments) for (const c of fragments) sources.push(a + b + c);
    return sources;
}

function compilerCorpus() {
    const separators = [' ', '\t', '\r\n', '\v', '\u00a0', '\u1680', '\u2003',
        '\u2028', '\u202f', '\u3000', '\ufeff', '// x\r\n', '// x\u2028 still comment\n'];
    const operands = [
        ['i32', 'x', '4', ['+', '-', '*', '/', '%', '>>']],
        ['bool', 'x', '4', ['<', '<=', '>', '>=', '===', '==', '>>=']],
        ['bool', 'false', 'true', ['||', '&&', '|', '&']],
    ];
    const cases = new Set();
    for (const space of separators) for (const [type, lhs, rhs, ops] of operands)
        for (const op of ops)
            cases.add(`function${space}f(x:i32):${type} { return ${lhs}${space}${op}${space}${rhs}; }`);
    const simple = 'function f(x:i32):i32 { return x + 2; }';
    for (const extra of ['_', '0', 'é', '\0', '\u0085', '\ufeff', '//', '//\r', '@',
            '//\u2028@', '/*a*/', '', '\ud800']) {
        for (const at of [0, 8, 12, simple.indexOf('return'), simple.indexOf('+'), simple.length])
            cases.add(simple.slice(0, at) + extra + simple.slice(at));
    }
    for (const literal of ['""', '"\\u0000"', '"\\uD800"', '"\\n\\t\\r\\f"', '"λ🚀"',
            '"\0"', '"split\nline"', '"\\x43"', '"\\u00ZZ"', '"unterminated']) {
        cases.add(`function f(b:buffer):i32 { return b.writeLiteral(0, ${literal}); }`);
    }
    for (const n of [0, 2, 127, 128, 129])
        cases.add('function f():i32 {' + 'if (true) {'.repeat(n) +
            'return 7; ' + '}'.repeat(n) + 'return 0;}');
    for (const n of [2147483647, 2147483648, 2147483649, -2147483648])
        cases.add(`function f():i32 {return ${n};}`);
    for (const second of ['function g():i32 { return f(9); }', 'function g():i32 { return nope; }',
            'function g():i32 { return \0; }', simple])
        cases.add(simple + '\n' + second);
    cases.add('', '// EOF', 'function', 'function f(x:custom):i32 {return x;}',
        'record P { x:i32; } function f(p:P):i32 {return p.x;}',
        'record P { x:i32; x:i32; } ' + simple,
        'function f(x:i32):i32 {let k:i32 = 0; while (k < x) {k = k + 1;} return k;}');
    return [...cases];
}

const suite = [observe, tokenTrace, compileTrace, lexicalCorpus, compilerCorpus].map(f => f.toString()).join('\n');
const results = {};
for (const lane of lanes) {
    const frontend = join(treatments, lane, 'typed/wasm.js');
    const raw = readFileSync(frontend);
    const reuse = !['base', 'cursor_fresh'].includes(lane);
    const lazy = lane === 'cursor_lazy';
    const script = suite + `
JSON.stringify({
    tokens: lexicalCorpus().map(source => tokenTrace(source, ${reuse}, ${lazy})),
    compile: compilerCorpus().map(compileTrace),
});
`;
    const context = vm.createContext({});
    vm.runInContext(raw.toString().replace('globalThis.compileTyped =',
        'globalThis.TestLexer = Lexer;\nglobalThis.compileTyped ='), context);
    vm.runInContext(readFileSync(backend, 'utf8'), context);
    const output = vm.runInContext(script, context);
    const nodeSha = sha(output);

    // Record actual calls for a real parse. Fixed keywords, punctuation and
    // the binary operator never appear in this list.
    if (lazy) {
        const demanded = vm.runInContext(`
            const demanded = [];
            const originalText = TestLexer.prototype.text;
            TestLexer.prototype.text = function() {
                const spelling = originalText.call(this);
                demanded.push(spelling);
                return spelling;
            };
            compileTyped('function f(x:i32):i32 { let gap:i32 = 3; return x + gap; }');
            JSON.stringify(demanded)
        `,context);
        assert.deepEqual(JSON.parse(demanded), ['f','x','i32','i32','gap','i32','3','x','gap']);
        results.lazyDemanded = JSON.parse(demanded);
    }

    let quickjsSha;
    if (quickjs) {
        const fixture = join(work, 'fixture-' + lane + '.js');
        const trace = join(work, 'quickjs-' + lane + '.json');
        writeFileSync(fixture, script);
        execFileSync(quickjs, ['lex', frontend, backend, fixture, trace]);
        quickjsSha = sha(readFileSync(trace));
        assert.equal(quickjsSha, nodeSha, lane + ' cross-engine trace mismatch');
    }
    results[lane] = {frontend: sha(raw), nodeSha, quickjsSha};
    assert.equal(nodeSha, results.base.nodeSha, lane + ' changed the observable token or compiler results');
    if (lane === 'base') {
        const rows = JSON.parse(output).compile;
        results.lexicalCases = lexicalCorpus().length;
        results.compilerCases = rows.length;
        results.diagnosticCounts = Object.fromEntries(['wasm', 'rv32Buffered', 'rv32Streamed']
            .map((kind, index) => [kind, rows.filter(r => r[index].error !== undefined).length]));
        for (const [wasm, buffered, streamed] of rows) {
            if (wasm.value) assert(WebAssembly.validate(new Uint8Array(wasm.value[0])));
            assert.deepEqual(streamed, buffered);
        }
    }
}
results.backend = sha(readFileSync(backend));
if (quickjs) results.quickjs = sha(readFileSync(quickjs));
console.log(JSON.stringify(results, null, 2));
