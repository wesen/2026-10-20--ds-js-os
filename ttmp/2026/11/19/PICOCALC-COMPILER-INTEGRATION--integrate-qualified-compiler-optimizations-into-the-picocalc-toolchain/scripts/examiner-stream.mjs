// node --disable-warning=ExperimentalWarning examiner-stream.mjs SNAPSHOTS REACTOR_DIR CANDIDATE_REV
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {queryObjects} from 'node:v8';
const [snapshots, reactors, candidateRev] = process.argv.slice(2);
assert(snapshots && reactors && candidateRev, 'pass compiler snapshots, native reactors and candidate revision');
const baselineRev = '3785155';
const paths = ['compiler/typed-wasm.js','compiler/typed-rv32.js','compiler/typed-world.js',
    'worlds/files/compile.js','worlds/agenda/compile.js'];
const hash = value => createHash('sha256').update(value).digest('hex');
const read = path => readFileSync(path,'utf8');
const snapshotsSHA256 = {};

function context(rev, observer) {
    const context = vm.createContext(observer ?? {});
    const digests = {};
    for (const path of paths) {
        let source=read(join(snapshots,rev,path));
        digests[path]=hash(source);
        if (observer && path === 'compiler/typed-wasm.js') {
            function replaceOnce(a,b) {
                assert.equal(source.split(a).length,2);
                source=source.replace(a,b);
            }
            replaceOnce('this.code = [];', 'this.code = new ObservedBody();');
            replaceOnce('finish(fn) { return fn; }','finish(fn) { observe(fn.name); return fn; }');
        }
        vm.runInContext(source,context,{filename:path});
    }
    snapshotsSHA256[rev]=digests;
    return context;
}

const base=context(baselineRev), candidate=context(candidateRev);
const stream={streamFunctions:true};
const wrapperResults={};
const calledFrontend=candidate.typedWasm.compileFunctions;
const observedConsumers=[];
candidate.typedWasm.compileFunctions=function(...args) {
    observedConsumers.push(typeof args[5] === 'function');
    return calledFrontend(...args);
};
for(const [app,parts,name,reactor] of [
    ['files',['files.typed'],'compileFiles','files-reactor'],
    ['agenda',['reminder.typed','entry.typed'],'compileAgenda','agenda-reactor'],
    ['editor',read('picocalc-os/worlds/editor/source.list').trim().split(/\s+/),'compileTypedWorld','typed-world-reactor'],
]){
    const source=parts.map(p=>read('picocalc-os/worlds/'+app+'/'+p)+'\n').join('');
    const elf=readFileSync(join(reactors,reactor+'.elf'));
    const wasm=readFileSync('picocalc-os/build/'+reactor+'.wasm');
    const nativeName=name+'Rv32';
    const before=Buffer.from(base[nativeName](source,elf));
    observedConsumers.length=0;
    const after=Buffer.from(candidate[nativeName](source,elf,stream));
    assert.deepEqual(after,before);
    assert.deepEqual(Buffer.from(candidate[nativeName](source,elf)),before);
    assert.deepEqual(observedConsumers,[true,false],nativeName+' forwards the public selection');
    const beforeWasm=Buffer.from(base[name](source,wasm));
    assert.deepEqual(Buffer.from(candidate[name](source,wasm)),beforeWasm);
    assert(WebAssembly.validate(beforeWasm));
    wrapperResults[app]={nativeStreamingSelected:observedConsumers[0],nativeDefaultStreaming:observedConsumers[1],nativeBytes:after.length,nativeSHA256:hash(after),wasmSHA256:hash(beforeWasm),
        reactorNativeSHA256:hash(elf),reactorWasmSHA256:hash(wasm)};
}

candidate.typedWasm.compileFunctions=calledFrontend;

// Cross index 127 and exercise call fixups to both imports and earlier local functions.
const imports=Array.from({length:130},(_,i)=>({name:'host'+i,params:['i32'],result:'i32'}));
const funcs=['function __proto__(x:i32):i32{return host129(x);}',
    'function constructor(x:i32):i32{return __proto__(x)+host0(x);}'];
for(let i=0;i<135;i++) funcs.push('function n'+i+'(x:i32):i32{return '+(i?'n'+(i-1):'constructor')+'(x)+1;}');
funcs.push('function end(x:i32):i32{if(x<0)return constructor(x);return n134(x)+__proto__(x);}');
const valid=funcs.join('\n');
const ref=base.typedRv32.compile(valid,imports);
const serialize=p=>JSON.parse(JSON.stringify({entries:p.entries,relocations:p.relocations,records:p.records,signatures:p.signatures,imports:p.importCount}));
for(const options of [undefined,{streamFunctions:false},stream]){
    const c=candidate.typedRv32.compile(valid,imports,undefined,options);
    assert.deepEqual(serialize(c),serialize(ref)); assert.deepEqual(Buffer.from(c.image),Buffer.from(ref.image));
    assert(Object.hasOwn(c.entries,'__proto__') && Object.hasOwn(c.entries,'constructor'));
}
const wideMeta={functions:ref.signatures.length,imports:ref.importCount,relocations:ref.relocations,
    imageSHA256:hash(ref.image), imageBytes:ref.image.length};
function diag(context,src,opts,imports=[],limit) {
    try {context.typedRv32.compile(src,imports,limit,opts);} catch(e){return e.name+' '+e.message;}
    assert.fail('expected the native compiler to reject this fixture');
}
const nine='function nine('+Array.from({length:9},(_,i)=>'x'+i+':i32').join(',')+'):i32{return 7;}';
const large='function large():i32{'+Array.from({length:530},(_,i)=>'let v'+i+'=0;').join('')+'return 0;}';
const f='function f():i32{return 0;}';
const diagnostics={};
for(const [key,source,match,imps,limit] of [
    ['forward','function a():i32{return later();}\nfunction later():i32{return 1;}',/unknown function later/],
    ['self','function a():i32{return a();}',/unknown function a/],
    ['duplicate',f+'\n'+f,/duplicate function f/],
    ['importCollision','function host0(x:i32):i32{return x;}',/duplicate function host0/,imports],
    ['reserved',nine+'\nfunction memory():i32{return 0;}',/reserved memory export/],
    ['lateType',nine+'\nfunction z():i32{return true;}',/expected i32/],
    ['lateName',large+'\nfunction z():i32{return later();}',/unknown function later/],
    ['backendFirst',nine+'\n'+large,/eight register arguments/],
    ['frameFirst',large+'\n'+nine,/frame exceeds/],
    ['malformed',large+'\nfunction z():i32{return (2;}',/expected \)/],
    ['commentOnly','// done\n',/expected function/],
    ['empty','',/expected a function/],
    ['limit',f,/input limit exceeded/,[],f.length-1]
]){
    const d=diag(base,source,undefined,imps,limit);
    assert.match(d,match,key);
    for(const options of [undefined,stream]) assert.equal(diag(candidate,source,options,imps,limit),d,key);
    diagnostics[key]=d;
}
assert(WebAssembly.validate(candidate.typedWasm.compile(nine).bytes));
// A failed streamed invocation must leave no metadata in the next compilation in the same realm.
const recovered=candidate.typedRv32.compile(valid,imports,valid.length,stream);
assert.deepEqual(serialize(recovered),serialize(ref));assert.deepEqual(Buffer.from(recovered.image),Buffer.from(ref.image));

function liveBodies(options, invalid) {
    // Instantiate the observed arrays from this realm so V8's heap query can see them.
    class ObservedBody extends Array {}
    const observed={};
    const targets=new Set(['f0','f7','f15','f31']);
    const c=context(candidateRev,{ObservedBody,observe(name){
        if(targets.has(name)) observed[name]=queryObjects(ObservedBody,{format:'count'});
    }});
    const source=Array.from({length:32},(_,i)=>'function f'+i+'():i32{return '+i+';}');
    if (invalid) source[2]=nine;
    if (invalid) assert.match(diag(c,source.join('\n'),options),/eight register arguments/);
    else c.typedRv32.compile(source.join('\n'),[],undefined,options);
    return observed;
}
const live={
    buffered:liveBodies(undefined,false),streamed:liveBodies(stream,false),
    bufferedError:liveBodies(undefined,true),streamedError:liveBodies(stream,true),
};
assert.deepEqual(Object.values(live.buffered),[1,8,16,32]);
assert.deepEqual(Object.values(live.streamed),[1,1,1,1]);
assert.deepEqual(Object.values(live.bufferedError),[1,8,16,32]);
assert.deepEqual(Object.values(live.streamedError),[1,1,1,1]);

console.log(JSON.stringify({node:process.version, revisions:[baselineRev,candidateRev], snapshotsSHA256,
    wrapperResults,wideMeta,diagnostics,live},null,2));
