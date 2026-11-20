// Validate the staged cursor against each revision's own preserved lexer.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createContext, runInContext, runInNewContext} from 'node:vm';
import {execFileSync} from 'node:child_process';

const [stage, elfPath, quickjs] = process.argv.slice(2);
assert(stage && elfPath, 'usage: node 11-check-eager-cursor.mjs staging-directory typed-world-reactor.elf [quickjs-lex-harness]');
const here = dirname(fileURLToPath(import.meta.url));
const day = resolve(here, '../..');
const factorial = 'PICOCALC-FRONTEND-FACTORIAL--separate-scanning-token-allocation-and-lazy-text-on-the-picocalc';
const oldTests = readFileSync(join(day, factorial, 'scripts/03-differential.mjs'), 'utf8');
const oldCorpus = oldTests.slice(oldTests.indexOf('function lexicalCorpus()'), oldTests.indexOf('\nconst suite ='));
assert(oldCorpus.includes('function compilerCorpus()'), 'historical corpus anchors changed');

function capture(action) {
    try {
        return action();
    } catch (error) {
        return [error.name, error.message];
    }
}

function trace(source, from, to, seek) {
    return capture(() => {
        const lex = new typedWasm.Lexer(source, from, to);
        if (seek !== undefined) {
            lex.offset = seek;
            lex.next();
        }
        const found = [];
        while (true) {
            const {kind, at, value} = lex.token;
            found.push([kind, at, value, lex.offset]);
            if (kind === 'eof') {
                lex.next();
                found.push([lex.token.kind, lex.token.at, lex.token.value, lex.offset]);
                return found;
            }
            if (found.length > source.length) throw new Error('scanner stalled');
            const error = capture(() => lex.next());
            if (error) return [...found, error];
        }
    });
}

function compilePair(source) {
    const result = parse => capture(() => {
        const {bytes, image, ...meta} = parse();
        return [Array.from(bytes ?? image), meta];
    });
    return [result(() => typedWasm.compile(source)),
        result(() => typedRv32.compile(source, [], undefined, {streamFunctions:false})),
        result(() => typedRv32.compile(source, [], undefined, {streamFunctions:true}))];
}

function boundedCases() {
    const output = [];
    const samples = [' \t n!==42; // line\r\nreturn n === 4;', 'λ _tok39 198',
        ' \u2028//x\u2029!\r\n  !==",\\"  //tail',
        ' { "//{\\\"\\\\\\u0041" } // eof', 'bad "unterminated',
        'enum Phase { First, Second } type Point = distinct i32;',
        'async function x(): i32 { const ok = await task(); return 0; }',
        ':"🙂"\n  false || true && x >>=0;', '"\\u00ZZ" @', '// comment\r\nx'];
    for (const s of samples) {
        for (let from = 0; from <= s.length; from++) {
            for (let to = from; to <= s.length; to++) output.push([s, from, to]);
        }
        for (let seek = 0; seek <= s.length; seek++) output.push(['x ' + s, 0, s.length + 2, seek]);
    }
    return output;
}

const code = oldCorpus + [capture, trace, compilePair, boundedCases].map(f => f.toString()).join('\n') + `
const bounded = boundedCases();
const ordinary = compilerCorpus();
ordinary.push('function f(x:i32):bool { return x !== 4; }',
  'function f(x:bool):bool { return x !== true; }',
  'function f(x:i32):bool { return x != 4; }',
  'function f(x:i32):bool { return x ! == 4; }',
  'enum Phase { Cold, Warm } function f(p: Phase):i32 { match (p) { Cold: { return 1; } Warm: { return 2; } } return 3; }');
JSON.stringify({full:lexicalCorpus().map(source => trace(source)),
    bounded:bounded.map(args => trace(...args)), outputs:ordinary.map(compilePair)});
`;

const wasm = readFileSync('picocalc-os/build/typed-world-reactor.wasm');
const elf = readFileSync(elfPath);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const count = runInNewContext(code.slice(0, code.indexOf('const bounded =')) +
    '({full:lexicalCorpus().length,bounded:boundedCases().length,compiled:compilerCorpus().length+5})');
const stats = {};
for (const revision of ['pre-g','g4']) {
    const actual = {};
    for (const variant of ['regex','cursor']) {
        const lane = revision + '-' + variant;
        const dir = join(stage, lane);
        const realm = createContext();
        for (const name of ['typed-wasm.js', 'typed-rv32.js', 'typed-world.js'])
            runInContext(readFileSync(join(dir, name), 'utf8'), realm);
        const trace = runInContext(code, realm);
        if (quickjs) {
            const fixture = join(dir, 'lexical-fixture.js'), result = join(dir, 'quickjs-trace.json');
            writeFileSync(fixture, code);
            execFileSync(quickjs, ['lex', join(dir, 'typed-wasm.js'), join(dir, 'typed-rv32.js'), fixture, result]);
            assert.equal(sha(readFileSync(result)), sha(trace), lane + ' QuickJS trace');
        }
        if (revision === 'g4') runInContext(readFileSync(join(dir,'typed-async.js'), 'utf8'), realm);
        const source = readFileSync(join(dir, 'editor.typed'), 'utf8');
        const opts = {asyncSource:true};
        const linkedWasm = realm.compileTypedWorld(source, wasm, opts);
        const linkedRv32 = realm.compileTypedWorldRv32(source, elf, opts);
        const native = realm.typedRv32.compile(source, realm.typedWorld.imports, 96 * 1024, opts);
        actual[variant] = {trace, linkedWasm:Buffer.from(linkedWasm), linkedRv32:Buffer.from(linkedRv32),
            rv32:Buffer.from(native.image), asyncSource:linkedWasm.asyncSource,
            layout:JSON.stringify(linkedWasm.asyncLayout), relocations:JSON.stringify(native.relocations),
            records:JSON.stringify(native.records), signatures:JSON.stringify(native.signatures)};
    }
    assert.equal(sha(actual.cursor.trace), sha(actual.regex.trace), revision + ' lexical or compiler corpus');
    for (const key of ['linkedWasm', 'linkedRv32', 'rv32'])
        assert(actual.cursor[key].equals(actual.regex[key]), revision + ' ' + key + ' byte difference');
    for (const key of ['asyncSource', 'layout', 'relocations', 'records', 'signatures'])
        assert(actual.cursor[key] === actual.regex[key], revision + ' ' + key + ' metadata difference');
    assert(WebAssembly.validate(actual.cursor.linkedWasm), revision + ' linked Wasm is invalid');
    const {trace,linkedWasm,linkedRv32,rv32} = actual.cursor;
    stats[revision] = {cases:count, traceSha256:sha(trace), wasmSha256:sha(linkedWasm),
        elfSha256:sha(linkedRv32), rv32Sha256:sha(rv32), wasmBytes:linkedWasm.length,
        elfBytes:linkedRv32.length, rv32Bytes:rv32.length};
}
console.log(JSON.stringify({quickjsChecked:!!quickjs, ...stats}, null, 2));
