// Regenerate from the project root: node path/to/03-capture-ray.mjs ESP_TOOL_PREFIX OUTPUT.json
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {runInThisContext} from 'node:vm';
import {runRv32} from '../../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';
import {decode} from '../../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/decode.mjs';

const [prefix, output] = process.argv.slice(2);
assert(prefix && output, 'expected ESP toolchain prefix and capture.json output');
const root = process.cwd();
const sourcePath = 'picocalc-os/worlds/raytrace/raytrace.typed';
const source = readFileSync(sourcePath, 'utf8');
const digest = data => createHash('sha256').update(data).digest('hex');
const sourceSHA = digest(source);
const functionName = 'typedRayComputeRow';
const workload = 'opening-160-rows';
const packetRows = new Map();
const study = {format:'p4-simd-evidence-v1', images:[], decisions:[], traces:[], packetSets:[]};
for (const lib of ['typed-wasm','typed-rv32','typed-pie-loops'])
    runInThisContext(readFileSync('picocalc-os/compiler/'+lib+'.js', 'utf8'));

function identify(mode, imageSHA) {
    const args = ['picocalc-os/tools/typed-inspect.mjs',sourcePath,'--target','rv32','--function',functionName,'--jsonl'];
    if (mode !== 'stock') args.push('--pie-loops',mode);
    const [module, fn] = execFileSync(process.execPath, args, {encoding:'utf8'}).trim().split('\n').map(JSON.parse);
    assert.equal(module.imageSha256,imageSHA);
    assert.equal(module.sourceSha256,sourceSHA);
    const ranges = [{role:'function',start:fn.start,end:fn.end}];
    if (mode === 'stock') return {ranges,fn};
    const plan = fn.loops.filter(p => p.lanes === 8);
    assert.equal(plan.length,1,'one eight-lane decision in row');
    const segment = fn.ranges.filter(r => r.segment === 'halfword producer and sign guard');
    assert.equal(segment.length,1,'one producer segment');
    const words = segment[0].words;
    const one = pattern => {
        const selected = words.filter(w => pattern.test(w.text));
        assert.equal(selected.length,1,pattern.toString());
        return selected[0].pc;
    };
    const start = mode === 'pie' ? one(/^esp\.vld\.128\.ip /) : one(/^sh t6, 0\(t5\)$/)-8;
    const guard = one(/^bgeu a4, t6, /);
    const accepted = Number(words.find(w => w.pc === guard).text.match(/0x[0-9a-f]+$/)[0]);
    const laneLoad = one(/^lhu t6, 0\(a6\)$/);
    const stores = words.filter(w => mode==='pie' ? w.text.startsWith('esp.vst.128.ip ') : /^sh t6, \d+\(t5\)$/.test(w.text));
    assert.equal(stores.length, mode==='pie'?1:8);
    for (const word of stores) ranges.push({role:'full-packet-scratch-store',start:word.pc,end:word.pc+4});
    ranges.push({role:'single-prefix-scratch-store', start:one(/^sh t6, \d+\(sp\)$/), end:one(/^sh t6, \d+\(sp\)$/)+4});
    ranges.push({role:'scalar-lane-load', start:laneLoad, end:laneLoad+4});
    for (const r of fn.ranges.filter(r=>r.segment))
        if (r.end>r.start) ranges.push({role:r.segment,start:r.start,end:r.end});
    return {ranges,start,guard,accepted,fn};
}

// Independent oracle reads only scalar input and schedule alignment. One group number
// counts dynamically admitted full packets across spheres within a single row.
function expectedMasks(bytes, y) {
    const c = i => bytes.readUInt16LE(4+2*i);
    const masks=[];
    for (let s=0;s<c(16);s++) {
        const dy = y-c(2+5*s), radius=c(4+5*s), term=radius*radius-dy*dy;
        if(term<0 || term>32766) continue;
        const horizontal=40+160*s;
        let x=0;
        while((64+4+2*(horizontal+x))%16 !== 0) x++;
        for(;x+8<=160;x+=8) {
            let mask=0;
            for(let i=0;i<8;i++) if(term-c(horizontal+x+i)>=0) mask |= 1<<i;
            masks.push(mask);
        }
    }
    return masks;
}

const fixtures=mkdtempSync(join(tmpdir(),'p4-simd-opening-'));
try {
    const maker=resolve(root,'ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/scripts/03-fixtures.mjs');
    execFileSync(process.execPath,[maker,fixtures]);
    for(const mode of ['stock','scalar','pie']) {
        const prog=typedRv32.compile(source,[],undefined,{pieLoops:mode==='stock'?undefined:mode});
        const imageSHA=digest(prog.image);
        const map=identify(mode,imageSHA);
        const dis=mode==='pie'?decode(prog.image,prefix):undefined;
        const hist=new Map(), packets=[];
        let totalSteps=0;
        for(let y=0;y<160;y++) {
            const initial=new Uint8Array(8192);
            const work=readFileSync(join(fixtures,y+'.in')).subarray(4);
            initial.set(work,64);
            const masks=[];
            let remaining=0, bit=0, mask=0, waiting=false;
            const result=runRv32(prog,functionName,[64,y],[],{},initial,dis,100000,pc=>{
                hist.set(pc,(hist.get(pc)||0)+1);
                if (waiting) {
                    assert(pc===map.accepted || pc===map.guard+4,'branch has only two legal endpoints');
                    if(pc===map.accepted) mask |= 1<<bit;
                    waiting=false; bit++;
                    if(--remaining===0) masks.push(mask);
                }
                if(pc===map.start) {
                    assert.equal(remaining,0);
                    remaining=8; bit=0; mask=0;
                }
                if(remaining && pc===map.guard) waiting=true;
            });
            assert(!result.trap && result.result===1);
            assert(readFileSync(join(fixtures,y+'.gold')).equals(result.bytes.subarray(64,4164)),'all 4100 observable bytes match');
            totalSteps += result.steps;
            assert.equal(remaining,0);
            if(mode!=='stock') {
                assert.deepEqual(masks,expectedMasks(work,y));
                masks.forEach((hitMask,group)=>packets.push({pose:'default',row:y,group,lanes:8,hitMask}));
            }
        }
        if(mode!=='stock')packetRows.set(mode,packets);
        study.images.push({sha256:imageSHA,code:Buffer.from(prog.image).toString('base64')});
        const sourceLines = source.split('\n');
        const fnStart = sourceLines.findIndex(l=>l.startsWith('function '+functionName+'('));
        const innerStart = sourceLines.findIndex((l,i)=> i>fnStart && l.startsWith('        for (let x = 0;'));
        assert(fnStart>=0 && innerStart>fnStart);
        const closing = sourceLines.findIndex((l,i)=>i>innerStart && l==='        }');
        const fnEnd = sourceLines.findIndex((l,i)=>i>fnStart && l==='}');
        study.decisions.push({id: mode+'-row',function:functionName,imageSHA,
            source:{path:sourcePath,sha256:sourceSHA,lineStart:(mode==='stock'?fnStart:innerStart)+1,lineEnd:(mode==='stock'?fnEnd:closing)+1},
            plan:mode,alternatives:['stock','scalar','pie'].map(plan=>({plan,status:plan===mode?'selected':'unselected',reason:'Experiment explicitly selected the build mode; no profitability estimate.'})),ranges:map.ranges});
        // Loop offsets are positions in the compiler tape. Source evidence belongs to
        // actual emitted tokens and can include the following token at the closing end.
        for (const rejected of (map.fn.loops ?? []).filter(loop => loop.reason)) {
            const ops=map.fn.operations;
            const first=ops.findIndex(op=>op.offset===rejected.loop && op.op==='loop');
            assert(first>=0,'loop offset must resolve to an inspected loop operation');
            let depth=1, last=first;
            while (depth && ++last<ops.length) {
                const op=ops[last].op;
                if(['block','loop','if'].includes(op)) depth++;
                if(op==='end') depth--;
            }
            assert.equal(depth,0);
            const ranges=map.fn.ranges
                .filter(r=>r.end>r.start && r.ordinals.some(n=>n>=ops[first].ordinal && n<=ops[last].ordinal))
                .map(r=>({role:'mapped-loop-instructions',start:r.start,end:r.end}));
            study.decisions.push({id:mode+'-rejected-'+rejected.loop,function:functionName,imageSHA,
                source:{path:sourcePath,sha256:sourceSHA,lineStart:ops[first].source.line,lineEnd:ops[last].source.line},
                plan:'ordinary', alternatives:[{plan:'eight-lane producer',status:'rejected',reason:rejected.reason}],ranges});
        }
        const counts=[...hist].sort((a,b)=>a[0]-b[0]).map(([pc,executions])=>({pc,executions}));
        assert.equal(counts.reduce((n,r)=>n+r.executions,0),totalSteps);
        study.traces.push({id:mode+'-opening',imageSHA,workload,steps:totalSteps,counts});
    }
    assert.deepEqual(packetRows.get('scalar'),packetRows.get('pie'),'same packets, masks and ordering in the paired treatments');
    study.packetSets.push({workload,sourceSHA,packets:packetRows.get('pie')});
    writeFileSync(output,JSON.stringify(study)+'\n');
    console.log(JSON.stringify(study.traces.map(t=>({id:t.id,steps:t.steps,uniquePCs:t.counts.length}))));
} finally { rmSync(fixtures,{recursive:true,force:true}); }
