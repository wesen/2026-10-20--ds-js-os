// Generate a self-contained QuickJS test with production screen/hints and UI builders.
import {capture,appSource,prelude} from './05-replay.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const {frames}=capture();
const chosen=['start','eat','move-down','self-collision','restart','enter-vacated-tail','wall-run-9','enable-autopilot','auto-50','auto-100','auto-150','auto-200'];
const samples=chosen.map(id=>frames.find(r=>r.id===id).state);
const semantic=readFileSync(new URL('./06-semantic.mjs',import.meta.url),'utf8').replaceAll('export ','');
const layout=prelude.slice(prelude.indexOf('  const isOpts ='),prelude.indexOf('  // ---- showing values'));
const screen=appSource.slice(appSource.indexOf('  .screen('));
const content=`(function(g){
const CW=22,CH=18,CELL=13;
const game={}, pub={screen(f){game.screen=f;return this},hints(f){game.hints=f;return this}};
const world={};
(function(g){${layout}})(world);
const ui=world.ui;
pub${screen}
${semantic}
const samples=${JSON.stringify(samples)};
const full=s=>({tree:game.screen(s),hints:game.hints(s)});
const json=s=>JSON.stringify(full(s));
const bytes=s=>{let n=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c<128)n++;else if(c<2048)n+=2;else if(c>=55296 && c<=56319){n+=4;i++;}else n+=3;}return n;};
const encoded=samples.map(s=>({j:json(s),t:encode(project(s)),sj:JSON.stringify(project(s))}));
for(const x of encoded)if(JSON.stringify(template(decode(x.t)))!==x.j)throw Error('Snake parity');
g.renderLabRun=function(arm,reps){
 if(['J','SJ','T'].indexOf(arm)<0||!Number.isInteger(reps)||reps<1||reps>500)throw Error('Snake parameters');
 const pack=arm==='J'?json:arm==='SJ'?s=>JSON.stringify(project(s)):s=>encode(project(s));
 const unpack=arm==='J'?s=>JSON.parse(s):arm==='SJ'?s=>template(JSON.parse(s)):s=>template(decode(s));
 const field=arm.toLowerCase(),sizes=encoded.map(x=>arm==='T'?x.t.byteLength:bytes(x[field]));
 let encodedCount=0,check=0,count=0,t0=labMicros();
 for(let r=0;r<reps;r++)for(const s of samples){const packed=pack(s);encodedCount+=packed.length;}
 const t1=labMicros();
 for(let r=0;r<reps;r++)for(const x of encoded){const a=unpack(x[field]);check+=a.tree.kids[1].ops.length+a.hints.length;count++;}
 const t2=labMicros();
 return JSON.stringify({arm,reps,count,producerUs:t1-t0,receiverUs:t2-t1,checksum:check,encodedUnits:encodedCount,bytes:sizes.reduce((a,b)=>a+b,0)*reps});
};
})(globalThis);\n`;
writeFileSync(process.argv[2],content);
