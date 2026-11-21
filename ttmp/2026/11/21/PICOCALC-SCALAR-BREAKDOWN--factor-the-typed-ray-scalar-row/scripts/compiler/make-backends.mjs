// Produce standalone bare-QuickJS compilers without editing production source.
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
const [sourceFile,stockFile,out]=process.argv.slice(2);
if(!out) throw Error('usage: node make-backends.mjs raytrace.typed typed-rv32.js out-dir');
const read=file=>readFileSync(file,'utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=read(sourceFile),stock=read(stockFile),frontend=read('picocalc-os/compiler/typed-wasm.js');
const ctx=createContext({});runInContext(frontend,ctx);
const fn=ctx.typedWasm.compileFunctions(source,0,[],undefined,true).functions.find(f=>f.name==='typedRayComputeRow');
const ir=JSON.stringify(Array.from(fn.code));
if(sha(ir)!=='ab7c7d8c0cd05beb8adb7e1a08368191cd044635da386677fed6d7156ad55477') throw Error('unknown row IR');
const start='function compile(source,';
const old='lowerLeaf(fn, callables, targets) ?? new FunctionCode(fn, callables, targets).lower()';
if(stock.split(start).length!==2 || stock.split(old).length!==2) throw Error('backend entry changed');
const pass=read(new URL('./row-pass.js',import.meta.url));
const variants=[
    ['checked-stack',9,false,false,false],['hoisted-stack',10,true,false,false],
    ['checked-register',11,false,true,false],['hoisted-register',12,true,true,false],['skip',13,true,true,true]
];
const manifest={sourceSHA256:sha(source),stockBackendSHA256:sha(stock),variants:{}};
mkdirSync(out,{recursive:true});
for (const [name,id,hoist,registers,skip] of variants){
    const flags=JSON.stringify({hoist,registers,skip});
    const backend=stock.replace(start,'const factorTemplate='+ir+';\nconst factorFlags='+flags+';\n'+pass+'\n'+start)
        .replace(old,'lowerFactorRow(fn, callables, targets, options) ?? '+old);
    const vm=createContext({});runInContext(frontend,vm);runInContext(backend,vm);
    const layouts=[];
    const prog=vm.typedRv32.compile(source,[],undefined,{onScalarRowLowered:layout=>layouts.push(layout)});
    if(layouts.length!==1) throw Error('row must have exactly one match');
    const buffered=vm.typedRv32.compile(source,[],undefined,{streamFunctions:false});
    if(sha(prog.image)!==sha(buffered.image)) throw Error('stream/buffer mismatch');
    writeFileSync(join(out,name+'.js'),backend);
    manifest.variants[name]={id,backendSHA256:sha(backend),bytes:prog.image.length,
        imageSHA256:sha(prog.image),entryBytes:prog.entries.typedRayComputeRow,...layouts[0]};
}
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
