// Independent checks through the two public compiler APIs, including failures.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const [control, candidate, backend] = process.argv.slice(2);
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
function compiler(file) {
    const context=vm.createContext({});
    for (const path of [file, backend]) vm.runInContext(readFileSync(path,'utf8'),context);
    return context;
}
function output(ctx, target, source) {
    try {
        const result=(target==='wasm' ? ctx.typedWasm : ctx.typedRv32).compile(source);
        const code=result.bytes??result.image;
        if (target==='wasm') assert(WebAssembly.validate(code));
        const {image,bytes,...meta}=result;
        return {sha:sha(code), metadata:sha(JSON.stringify(meta))};
    } catch (error) {
        if (error.name!=='SyntaxError') throw error;
        return {error:error.name, message:error.message};
    }
}
const corpus=new Set();
const separators=[' ','\t','\n','\r\n','\f','\v','\u00a0','\u1680','\u2003','\u2028','\u2029','\u3000',
    '\ufeff','// x\r\n','// \u2028 x\n',' \n // double\n// line\n \t'];
for (const space of separators) {
    for (const operator of ['+','-','*','/','%','>>','<','>=','===','||','&&','==','>>=','|']) {
        const result=['<','>=','===','||','&&'].includes(operator)?'bool':'i32';
        const expr=operator==='||'||operator==='&&' ? 'true'+space+operator+space+'false' : 'x'+space+operator+space+'3';
        corpus.add('function'+space+'f(x:'+space+'i32):'+space+result+space+'{ return '+expr+'; }');
    }
}
for (const lit of ['""','"plain"','"λ🚀"','"\\u0000"','"\\uD800"','"\\n\\t\\r\\f"','"\\"\\\\\\/"',
        '"\u0000"','"split\nline"','"\\x60"','"\\u000"','"\\uZZZZ"','"unterminated']) {
    corpus.add('function f(b: buffer): i32 { return b.writeLiteral(0, '+lit+'); }');
}
const small='function f(x: i32): i32 { return x + 2; }';
for(const extra of ['_','0','é','\u0000','\u0085','\ufeff','//','//\r','@','//\u2028@','/*a*/','"','\uD800']) {
    for(const at of [0,8,12,small.indexOf('return'),small.indexOf('+'),small.length]) {
        corpus.add(small.slice(0,at)+extra+small.slice(at));
    }
}
for (const n of [0,2,31,127,128,129]) {
    corpus.add('function f(): i32 { '+'if (true) { '.repeat(n)+'return 7; '+'} '.repeat(n)+'return 0; }');
}
const a=compiler(control), b=compiler(candidate);
const counts={};
for (const target of ['wasm','rv32']) {
    const stats=counts[target]={success:0, syntax_error:0};
    for (const src of corpus) {
        const old=output(a,target,src), next=output(b,target,src);
        assert.deepEqual(next,old,JSON.stringify({target,src}));
        stats[old.error?'syntax_error':'success']++;
    }
}
console.log(JSON.stringify({sources:corpus.size,fixture_sha:sha([...corpus].join('\u001e')),counts,
    inputs:[control,candidate,backend].map(p=>sha(readFileSync(p)))},null,2));
