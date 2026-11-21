// Fresh VM realm in each arm; repeated runs share one Node process.
import {readFileSync,writeFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {performance} from 'node:perf_hooks';
const compiler=['typed-wasm','typed-rv32','typed-pie-loops'].map(n=>readFileSync('picocalc-os/compiler/'+n+'.js','utf8'));
const source=readFileSync('picocalc-os/worlds/raytrace/raytrace.typed','utf8');
const median=xs=>{const v=xs.slice().sort((a,b)=>a-b),mid=v.length>>1;return v.length%2?v[mid]:(v[mid-1]+v[mid])/2;};
const arms=['baseline','shadow','general'],runs=[];
for(let round=0;round<30;round++){
    for(let n=0;n<3;n++){
        const arm=arms[(round+n)%3],ctx=createContext({});
        for(const js of compiler)runInContext(js,ctx);
        const options={pieLoops:'pie-empty'};
        if(arm!=='baseline')options.inlineGuardedReturns=arm==='general'||(name=>name==='typedRayInShadow');
        const start=performance.now(),img=ctx.typedRv32.compile(source,[],undefined,options),ms=performance.now()-start;
        runs.push({round,arm,ms,bytes:img.image.length});
    }
}
const medians={},paired={};
for(const a of arms){
    const rows=runs.filter(x=>x.arm===a);
    medians[a]=median(rows.map(x=>x.ms));
    const differences=rows.map(x=>x.ms-runs.find(y=>y.arm==='baseline'&&y.round===x.round).ms);
    paired[a]={medianDeltaMs:median(differences),negativePairs:differences.filter(d=>d<0).length};
}
const result={node:process.version,method:'30 rotated triplets, fresh V8 context per arm; compilation only',medians,paired,runs};
writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(medians,paired);
