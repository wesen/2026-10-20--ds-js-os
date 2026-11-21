// Generate the side-by-side artifact from actual compiler inspection, not a hand disassembly.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const [out]=process.argv.slice(2),source='picocalc-os/worlds/raytrace/raytrace.typed';
const modes=['stock','scalar','pie'];
const rows=modes.map(mode=>{
    const args=['picocalc-os/tools/typed-inspect.mjs',source,'--target','rv32','--function','typedRayComputeRow','--jsonl'];
    if(mode!=='stock') args.push('--pie-loops',mode);
    const [header,fn]=execFileSync(process.execPath,args,{encoding:'utf8'}).trim().split('\n').map(JSON.parse);
    let at=fn.start;
    for(const r of fn.ranges){if(r.start!==at)throw Error('gap in '+mode);at=r.end;}
    if(at!==fn.end)throw Error('unmapped function end');
    return {header,fn};
});
const wasm=execFileSync(process.execPath,['picocalc-os/tools/typed-inspect.mjs',source,'--target','wasm','--function','typedRayComputeRow','--jsonl'],{encoding:'utf8'}).trim().split('\n').map(JSON.parse)[1];
const fs=rows[0].fn,plan=rows[2].fn.loops.find(l=>l.lanes);
const text=['---','Title: An unchanged ray subtraction through four compiler stages',
    'Ticket: PICOCALC-PIE-LOOPS','Status: complete','Topics: [picocalc, compiler, performance]',
    'DocType: reference','Intent: long-term','Owners: []','RelatedFiles: []','ExternalSources: []',
    'Summary: Source, numeric operations, inferred facts and emitted native instructions for the same loop.',
    'LastUpdated: 2026-11-21','WhatFor: Compare generated schedules','WhenToUse: Reviewing the packed loop transformation','---','',
    '# An unchanged ray subtraction through four compiler stages','',
    'Generated from the live inspector. The rows cover the same Typed source and use byte offsets within their own final target images.','',
    '## Source and frontend','','```js',readFileSync(source,'utf8').split('\n').slice(111,120).join('\n'),'```','',
    'The Wasm body has '+wasm.operations.length+' operations and '+(wasm.end-wasm.start)+' bytes. The native input tape below uses cell offsets.','',
    '```text',...fs.operations.filter(o=>o.offset>=182 && o.offset<207).map(o=>o.offset+'  '+(o.op+' '+o.operands.join(' ')).trimEnd()),'```','',
    '## Inferred facts','','```json',JSON.stringify(plan,null,2),'```','',
    '## Native instructions','','| Stock scalar | Matched scalar | PIE |','|---|---|---|'];
const series=rows.map(({fn},i)=>{
    const ranges=fn.ranges.filter(r=>i?r.segment==='halfword producer and sign guard':
        r.ordinals.some(n=>fn.operations[n].offset>=182 && fn.operations[n].offset<207));
    return ranges.flatMap(r=>r.words.map(w=>w.pc.toString(16)+' '+w.text));
});
for(let i=0;i<Math.max(...series.map(s=>s.length));i++)text.push('| '+series.map(s=>s[i]?'\u0060'+s[i]+'\u0060':'').join(' | ')+' |');
text.push('','Each column lists its own machine sequence in order. Adjacent cells can perform different work. The accelerated columns include the peel and lane sign guard. The once-per-region broadcast occurs in the admission code. The scalar hit continuation and the ordinary fallback also remain in the native image.','');
writeFileSync(join(out,'comparison.md'),text.join('\n'));
