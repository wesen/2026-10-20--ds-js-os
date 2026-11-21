/* Compile three equivalent kernels using scalar, runtime and compile-time proofs.
 * Emit externally callable RV32 symbols and prove checks through exact interpreter
 * traces. Use a separate VM realm for the experimental pass so production stays fixed.
 */
import assert from 'node:assert/strict';
import {readFileSync as read, writeFileSync as write, readdirSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [out,prefix]=process.argv.slice(2);
assert(out && prefix,'usage: node 04-static-proof.mjs OUT ESP_TOOLCHAIN_PREFIX');
const repo=process.cwd();
const base=join(repo,'ttmp/2026/11/20');
const helper=join(base,readdirSync(base).find(n=>n.startsWith('PICOCALC-TYPED-PIE--')),'scripts/review');
const {decode}=await import(pathToFileURL(join(helper,'decode.mjs')));
let interp=read(join(helper,'run-rv32.mjs'),'utf8');
function replaceOnce(text,from,to){assert.equal(text.split(from).length,2,from);return text.replace(from,to);}
interp=replaceOnce(interp,"from './packed.mjs'","from '"+pathToFileURL(join(helper,'packed.mjs')).href+"'");
interp=replaceOnce(interp,"onFetch(at, w)","onFetch(at, w, x, memory)");
const {runRv32}=await import('data:text/javascript;base64,'+Buffer.from(interp).toString('base64'));
const vendor={};
for(const variant of ['scalar','guarded','static']) {
  const c=createContext({});
  for(const n of ['typed-wasm','typed-rv32','typed-pie-loops']){
    let js=read(join(repo,'picocalc-os/compiler/'+n+'.js'),'utf8');
    if(n==='typed-pie-loops' && variant==='static'){
      js=replaceOnce(js,'if (p.reason) continue;',
        'if (p.reason) continue;\n        if (p.row.constant!==undefined && (p.row.constant>>>0)>32766) continue;');
      js=replaceOnce(js,'this.constant(t5,32766); this.branch(6,t5,uniform,ordinary);',
        'if(p.row.constant===undefined){this.constant(t5,32766); this.branch(6,t5,uniform,ordinary);}');
    }
    runInContext(js,c);
  }
  vendor[variant]=c.typedRv32;
}
const variants=['scalar','guarded','static'], plans=[], asm=['.option push','.option norvc'];
const builds={};
for(const [family,term] of [['inside','32766'],['boundary','32767'],['dynamic','ceiling']]){
  const source=`function evaluate(input:buffer, output:buffer, first:i32, n:i32, ceiling:i32): i32 {
    let total=0;
    for(let i=0;i<n;i=i+1){
      let d=${term}-input.charCodeAt(first+i);
      if(d>=0){output.setCharCodeAt(i+1,d); total=total+d;}
    }
    return total;
  }`;
  builds[family]={};
  for(const variant of variants){
    const prog=vendor[variant].compile(source,[],undefined,{pieLoops:variant==='scalar'?undefined:'pie'});
    const decoded=decode(prog.image,prefix);
    builds[family][variant]={prog,decoded};
    const sym='proof_'+family+'_'+variant;
    assert.equal(prog.entries.evaluate,0);
    asm.push('.section .text.'+sym+',"ax",@progbits','.balign 16','.global '+sym,'.type '+sym+',@function',sym+':');
    for(let i=0;i<prog.image.length;i+=4)asm.push('.byte '+prog.image.slice(i,i+4).join(','));
    plans.push({family,variant,bytes:prog.image.length,imageSHA:createHash('sha256').update(prog.image).digest('hex')});
  }
}
asm.push('.option pop');write(join(out,'proof_images.S'),asm.join('\n')+'\n');
const summarize={}, hash=createHash('sha256');
function oracle(input,ip,op,first,n,term){
  const copy=input.slice(), m=new DataView(copy.buffer), writes=[];
  let trap=null,sum=0;
  for(let i=0;i<n;i++){
    const index=first+i;
    if((index>>>0)>=m.getUint32(ip,true)){trap=[ip,index];break;}
    const d=(term-m.getUint16(ip+4+2*index,true))|0;
    if(d>=0) {
      if(i+1>=m.getUint32(op,true)){trap=[op,i+1];break;}
      const address=op+4+2*(i+1);
      writes.push([address,d&65535]); m.setUint16(address,d,true);sum=(sum+d)|0;
    }
  }
  return {trap, writes, bytes:copy, sum};
}
for(const family of Object.keys(builds)) for(const term of (family==='inside'?[32766]:family==='boundary'?[32767]:[-1,0,1,32766,32767,65535,-2147483648,2147483647])){
 const counts={cases:0,traps:0,adverseWrites:0,guestSteps:{scalar:0,guarded:0,static:0},packedStores:{scalar:0,guarded:0,static:0}};
 for(const ip of [64,68,76]) for(const [delta,inpCap,outCap] of [[320,64,64],[0,64,64],[4,64,64],[320,6,64],[320,64,4],[320,64,17]])for(const n of [0,1,7,8,9,10,11,12,13,14,15,16,23,32]){
  const op=ip+delta, initial=new Uint8Array(1024),mem=new DataView(initial.buffer);
  for(let i=0;i<64;i++){mem.setUint16(ip+4+2*i,[0,1,31,32766,32767,32768,65534,65535][i%8],true);}
  mem.setUint32(ip,inpCap,true);mem.setUint32(op,outCap,true);
  const want=oracle(initial,ip,op,1,n,term);
  for(const variant of variants){
    const {prog,decoded}=builds[family][variant], writes=[]; let trap=null;
    const result=runRv32(prog,'evaluate',[ip,op,1,n,term],[],{},initial,decoded,100000,(_pc,w,x)=>{
      if(w===0x00100073) trap=[x[31]>>>0,x[30]|0]; // typed checked-address receiver/index in t6/t5
      if((w&127)!==35 || (w>>>12&7)!==1)return;
      const offset=(w>>25<<5)|(w>>>7&31);
      const address=(x[w>>>15&31]+offset)>>>0;
      if(address<initial.length)writes.push([address,x[w>>>20&31]&65535]);
    });
    assert.deepEqual(trap,want.trap,`${family}/${variant} first failing receiver/index`);
    assert.deepEqual(writes,want.writes,`${family}/${variant} ordered halfword writes`);
    assert.deepEqual(result.bytes,want.bytes);
    if(!want.trap)assert.equal(result.result,want.sum);
    counts.guestSteps[variant]+=result.steps;counts.packedStores[variant]+=result.packed.stores;
  }
  counts.cases++; if(want.trap){counts.traps++;if(want.writes.length)counts.adverseWrites++;}
  hash.update(JSON.stringify([family,term,ip,delta,inpCap,outCap,n,want.trap,want.writes]));
 }
 summarize[family+'_'+term]=counts;
}
write(join(out,'static-proof.json'),JSON.stringify({plans, cases:summarize,witnessSHA:hash.digest('hex')},null,2)+'\n');
