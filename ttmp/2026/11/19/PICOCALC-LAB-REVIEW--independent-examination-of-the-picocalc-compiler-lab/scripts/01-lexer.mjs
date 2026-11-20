// Test the actual compiled lexer closure by exposing its class in two disposable VMs.
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const sha = data => createHash('sha256').update(data).digest('hex');
const [control, candidate, quickjs, backend] = process.argv.slice(2);
const paths = [control, candidate];
const lexers = paths.map(path => {
    const source = readFileSync(path, 'utf8');
    const needle = 'globalThis.compileTyped =';
    assert.equal(source.split(needle).length, 2);
    const ctx = vm.createContext({});
    vm.runInContext(source.replace(needle, 'globalThis.ExaminedLexer = Lexer;\n' + needle), ctx);
    return ctx.ExaminedLexer;
});
function trace(Constructor, source) {
    const events = [];
    try {
        const lexer = new Constructor(source);
        while (true) {
            const {kind, value, at} = lexer.token;
            events.push([kind, value, at, lexer.offset]);
            if (kind === 'eof') break;
            lexer.next();
        }
    } catch (error) {
        events.push([error.name, error.message]);
    }
    return events;
}
let cases = 0, rejected = 0;
const digest = createHash('sha256');
function check(source) {
    const control = trace(lexers[0], source);
    assert.deepEqual(trace(lexers[1], source), control, JSON.stringify(source));
    if (control.at(-1)[0] === 'SyntaxError') rejected++;
    digest.update(JSON.stringify([source, control]));
    cases++;
}
function* corpus() {
    for (let code = 0; code <= 65535; code++) yield 'x' + String.fromCharCode(code) + 'y';
    const chunks = ['//', '\r', '\n', '\u2028', '"', '\\', 'u000a', '\0', '>>', '=', '4', 'A', '&', '.', '/', ' '];
    for (const a of chunks) for (const b of chunks) for (const c of chunks) yield a + b + c;
}
for (const source of corpus()) check(source);
const result = {files:paths.map(p=>sha(readFileSync(p))),cases,rejected,traceSha256:digest.digest('hex')};
if (quickjs && backend) {
    const dir=mkdtempSync(join(tmpdir(),'review-lex-'));
    try {
        const fixture=join(dir,'fixture.js'), output=join(dir,'events.json');
        writeFileSync(fixture, [trace.toString(), corpus.toString(),
            "Array.from(corpus(),s=>JSON.stringify([s,trace(TestLexer,s)])).join('')"].join('\n'));
        result.quickjsBinary=sha(readFileSync(quickjs));
        result.quickjsTraces=paths.map(path=>{
            execFileSync(quickjs,['lex',path,backend,fixture,output]);
            return sha(readFileSync(output));
        });
        assert.deepEqual(result.quickjsTraces,[result.traceSha256,result.traceSha256]);
    } finally {
        rmSync(dir,{recursive:true,force:true});
    }
}
console.log(JSON.stringify(result,null,2));
