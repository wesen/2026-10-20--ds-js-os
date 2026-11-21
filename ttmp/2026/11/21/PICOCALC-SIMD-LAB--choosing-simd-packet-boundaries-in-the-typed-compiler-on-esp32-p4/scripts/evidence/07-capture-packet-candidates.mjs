// node .../07-capture-packet-candidates.mjs <ESP-pref> <04-packet-images output> <candidate.json>
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync as read,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {runRv32} from '../../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';
import {decode} from '../../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/decode.mjs';

const [prefix,stage,out]=process.argv.slice(2);
assert(prefix && stage && out,'expected toolchain prefix, director staging directory and capture output file');
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourcePath='picocalc-os/worlds/raytrace/raytrace.typed',source=read(sourcePath,'utf8');
const receipt=JSON.parse(read(join(stage,'packet-images.json')));
assert.equal(sha(source),receipt.sourceSHA);
const context=createContext({});
// Reproduce the vintage that generated the board row bodies even after new
// experimental lowering modes have been added to the production compiler.
const compilerRevision='9a1ff99d2e11c9f3618fc42e979b643c1023521d';
for (const f of ['picocalc-os/compiler/typed-wasm.js','picocalc-os/compiler/typed-rv32.js']) {
    const contents=execFileSync('git',['show',compilerRevision+':'+f],{encoding:'utf8'});
    runInContext(contents,context,{filename:f});
}
runInContext(read(join(stage,'packet-candidate.js'),'utf8'),context,{filename:'packet-candidate.js'});
const name='typedRayComputeRow',workload='opening-160-rows';
const baseline=JSON.parse(read(new URL('../../various/evidence/ray.json',import.meta.url)));
const emittedMasks=baseline.packetSets.find(s=>s.workload===workload).packets;
const empty=emittedMasks.filter(p=>p.hitMask===0).length;
const full=emittedMasks.filter(p=>p.hitMask===255).length;
const baselineTr=baseline.traces.find(t=>t.id==='pie-opening');
const baselineDec=baseline.decisions.find(d=>d.id==='pie-row');
const baselineLanePC=baselineDec.ranges.find(r=>r.role==='scalar-lane-load').start;
const allLanes=baselineTr.counts.find(c=>c.pc===baselineLanePC).executions;
const result={format:baseline.format,images:[],traces:[],decisions:[],packetSets:[]};
const fixtures=mkdtempSync(join(tmpdir(),'p4-simd-candidate-'));
try {
    const maker='ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/scripts/03-fixtures.mjs';
    execFileSync(process.execPath,[maker,fixtures]);
    for(const arm of ['empty','full']) {
        context.packetResearchVariant=arm;
        const events=[];
        const prog=context.typedRv32.compile(source,[],undefined,{pieLoops:'pie',inspect:{function:name,emit:e=>events.push(e)}});
        const imageSHA=sha(prog.image),identity=receipt.arms[arm];
        assert.equal(imageSHA,identity.imageSHA);
        assert.equal(sha(prog.image.subarray(identity.start,identity.end)),identity.rowSHA);
        const emitted=events.find(e=>e.kind==='emission' && e.function===name);
        assert.equal(emitted.start,identity.start);
        assert.equal(emitted.end,identity.end);
        const dis=decode(prog.image,prefix);
        const ranges=[{start:emitted.start,end:emitted.end,role:'function'}];
        for(const r of emitted.ranges.filter(r=>r.segment && r.end>r.start))
            ranges.push({start:r.start,end:r.end,role:r.segment});
        const producer=emitted.ranges.find(r=>r.segment==='halfword producer and sign guard');
        const roles=new Map();
        for (const [pc,ins] of dis) {
            if(pc<emitted.start || pc>=emitted.end)continue;
            const ext = {
                'esp.min.u16.a':'min-reduction', 'esp.max.u16.a':'max-reduction',
                'esp.movi.16.a':'extract-full-hit-lane', 'esp.vld.128.ip':'packet-input-load',
                'esp.vst.128.ip':'full-packet-scratch-store', 'esp.vsub.s16':'packed-subtraction'
            };
            let role=ext[ins.op];
            if(pc>=producer.start && pc<producer.end && ins.op==='lhu' && ins.args.join(',')==='x31,0(x16)')role='scalar-lane-load';
            if(!role)continue;
            if(!roles.has(role))roles.set(role,[]);
            roles.get(role).push(pc);
            ranges.push({start:pc,end:pc+4,role});
        }
        for(const r of ['packet-input-load','full-packet-scratch-store','scalar-lane-load','min-reduction'])
            assert.equal(roles.get(r)?.length,1,r);
        assert.equal(roles.get('extract-full-hit-lane')?.length ?? 0,arm==='full'?8:0);
        const hist=new Map();
        let total=0;
        for(let y=0;y<160;y++){
            const init=new Uint8Array(8192);
            init.set(read(join(fixtures,y+'.in')).subarray(4),64);
            const run=runRv32(prog,name,[64,y],[],{},init,dis,100000,pc=>hist.set(pc,(hist.get(pc)||0)+1));
            assert(!run.trap && run.result===1);
            assert(read(join(fixtures,y+'.gold')).equals(run.bytes.subarray(64,4164)),'checked output for row '+y);
            total+=run.steps;
        }
        const tally=role=>(roles.get(role)??[]).reduce((n,pc)=>n+(hist.get(pc)??0),0);
        assert.equal(tally('min-reduction'),emittedMasks.length);
        const skipped=empty+(arm==='full'?full:0);
        assert.equal(tally('full-packet-scratch-store'),emittedMasks.length-skipped);
        assert.equal(tally('scalar-lane-load'),allLanes-8*skipped);
        assert.equal(tally('extract-full-hit-lane'),arm==='full'?full*8:0);
        const counts=[...hist].sort((a,b)=>a[0]-b[0]).map(([pc,executions])=>({pc,executions}));
        assert.equal(counts.reduce((n,c)=>n+c.executions,0),total);
        result.images.push({sha256:imageSHA,code:Buffer.from(prog.image).toString('base64')});
        result.decisions.push({id:arm+'-row',function:name,source:baselineDec.source,imageSHA,plan:arm,
            alternatives:['pie','empty','full'].map(plan=>({plan,status:plan===arm?'selected':'unselected',reason:'Forced experimental packet strategy selected before execution.'})),ranges});
        result.traces.push({id:arm+'-opening',imageSHA,workload,steps:total,counts});
        console.log(JSON.stringify({arm,total,roles:Object.fromEntries([...roles.keys()].map(r=>[r,tally(r)]))}));
    }
    writeFileSync(out,JSON.stringify(result)+'\n');
} finally { rmSync(fixtures,{recursive:true,force:true}); }
