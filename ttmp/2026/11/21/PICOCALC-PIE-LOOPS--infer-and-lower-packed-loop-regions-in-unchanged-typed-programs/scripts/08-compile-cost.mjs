// Fresh compiler contexts, with ordering rotated within each round. Time
// evaluating the optional source separately from compiling the target program.
import {readFileSync as read} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {performance} from 'node:perf_hooks';
const load=name=>read('picocalc-os/compiler/'+name+'.js','utf8');
const wasm=load('typed-wasm'), rv=load('typed-rv32'), plugin=load('typed-pie-loops');
const source=read('picocalc-os/worlds/raytrace/raytrace.typed','utf8');
const result=[];
for(let rep=0;rep<12;rep++){
    const modes=['stock','scalar','pie'];
    for(let i=0;i<3;i++){
        const mode=modes[(rep+i)%3], compiler=createContext({});
        runInContext(wasm,compiler);runInContext(rv,compiler);
        const begin=performance.now();
        if(mode!=='stock')runInContext(plugin,compiler);
        const ready=performance.now();
        const image=compiler.typedRv32.compile(source,[],undefined,{pieLoops:mode==='stock'?undefined:mode});
        result.push({rep,mode,loadMs:ready-begin,compileMs:performance.now()-ready,bytes:image.image.byteLength});
    }
}
console.log(JSON.stringify({node:process.version,rounds:result},null,2));
