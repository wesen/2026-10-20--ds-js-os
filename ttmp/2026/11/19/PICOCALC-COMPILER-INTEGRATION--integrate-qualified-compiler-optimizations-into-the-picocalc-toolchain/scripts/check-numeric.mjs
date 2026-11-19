// Compare the public compilers at a selected revision using identical tested inputs and reactors.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [reactors, revision] = process.argv.slice(2);
assert(reactors, 'pass the ESP-IDF build/esp-idf/main directory with the three native reactors');
const read = path => readFileSync('picocalc-os/' + path);
const sourceAt = (rev, path) => rev ? execFileSync('git',['show',rev+':picocalc-os/'+path]) : read(path);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function context(rev) {
    const context = vm.createContext();
    for (const file of ['compiler/typed-wasm.js','compiler/typed-rv32.js','compiler/typed-world.js',
                        'worlds/files/compile.js','worlds/agenda/compile.js'])
        vm.runInContext(sourceAt(rev,file).toString(),context,{filename:file});
    return context;
}
const control = context('e202e94'), candidate = context(revision);
const rows = [];
for (const [world, sources, reactor, entry] of [
    ['files',['files.typed'],'files-reactor','compileFiles'],
    ['agenda',['reminder.typed','entry.typed'],'agenda-reactor','compileAgenda'],
    ['editor',read('worlds/editor/source.list').toString().trim().split('\n'),'typed-world-reactor','compileTypedWorld']]) {
    const src = sources.map(file => read('worlds/'+world+'/'+file).toString()+'\n').join('');
    for (const [suffix, binary] of [['',read('build/'+reactor+'.wasm')],['Rv32',readFileSync(join(reactors,reactor+'.elf'))]]) {
        const target = entry + suffix;
        const expected = control[target](src,binary), actual = candidate[target](src,binary);
        assert.deepEqual(Buffer.from(actual),Buffer.from(expected),target);
        if (!suffix) assert(WebAssembly.validate(actual),target);
        rows.push({world,target,bytes:actual.length,sha256:digest(actual)});
    }
}

const fields=Array.from({length:36},(_,i)=>'f'+i+': i32;').join('');
const locals=Array.from({length:135},(_,i)=>'const local'+i+' = '+i+';').join('');
const funcs=Array.from({length:135},(_,i)=>'function f'+i+'(): i32 { return '+i+'; }').join('\n');
const wide='record R {'+fields+'}\n'+funcs+
    '\nfunction wide(r:R, b:buffer):i32 {'+locals+' r.f35 = -2147483648; b.writeLiteral(0,"'+'x'.repeat(95)+'");'+
    ' return r.f35 + f134() + local134 + 2147483647; }';
assert.deepEqual(Buffer.from(candidate.typedWasm.compile(wide).bytes),Buffer.from(control.typedWasm.compile(wide).bytes));
const a=candidate.typedRv32.compile(wide), b=control.typedRv32.compile(wide);
assert.deepEqual(Buffer.from(a.image),Buffer.from(b.image));
const metadata = ({image,...rest}) => JSON.parse(JSON.stringify(rest));
assert.deepEqual(metadata(a),metadata(b));
const numeric=candidate.typedWasm.compileFunctions(wide,0,[],undefined,true).functions.at(-1);
assert(!Object.hasOwn(numeric,'body') && numeric.code.includes(-2147483648) && numeric.code.includes(2147483647));
for (const invalid of ['function f(): i32 { return true; }',
    'function nine(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32,i:i32):i32{return a;}',
    'function nine(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32,i:i32):i32{return a;} function late():i32{return true;}']) {
    function diagnostic(ctx) {
        try {ctx.typedRv32.compile(invalid);} catch(e) {return e.name+' '+e.message;}
        assert.fail('expected rejection');
    }
    assert.equal(diagnostic(candidate),diagnostic(control));
}
console.log(JSON.stringify({control:'e202e94', candidate:revision??'worktree',worlds:rows,wideNativeBytes:a.image.length,rejections:3},null,2));
