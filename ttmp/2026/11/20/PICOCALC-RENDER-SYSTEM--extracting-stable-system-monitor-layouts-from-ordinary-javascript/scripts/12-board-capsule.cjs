// node scripts/12-board-capsule.cjs /tmp/render-system-board.js
const {fs,read,uiCode,src,scripts,assert}=require('./04-harness.cjs');
const {manualSource}=require('./07-manual-study.cjs');
const {extract}=require('./08-extract.cjs');
const spec=extract(src('sysmon'));
function factory(source) {
  return '(function(){let screen,hints;const b={};for(const k of ["title","key","about","icon","state","onStart","on","every","screen","hints"])b[k]=x=>{if(k==="screen")screen=x;if(k==="hints")hints=x;return b;};const app=()=>b;'+source+'\nreturn {screen:screen,hints:hints};})()';
}
const code=`(function(){
const ui=(function(){${uiCode}})();
${read(scripts+'/03-corpus.cjs').split('// This input')[0]}
const cases=systemCases();
const G=${factory(src('sysmon'))}, M=${factory(manualSource())};
${read(scripts+'/06-manual-receiver.js')}
${read(scripts+'/09-auto-runtime.js')}
const codec=makeAutoCodec(${JSON.stringify({version:spec.version,entries:spec.entries})});
function checksum(h,str){for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619)>>>0;return h;}
function utf8bytes(s){let n=0;for(const c of s){const v=c.codePointAt(0);n+=v<128?1:v<2048?2:v<65536?3:4;}return n;}
globalThis.renderLabRun=function(arm,reps){
  if(!["G","M","A"].includes(arm))throw Error("unknown arm");
  let pu=0,ru=0,maxProducer=0,maxReceiver=0,bytes=0,packets=0,h=2166136261;
  for(let r=0;r<reps;r++){
    let prev;
    for(const f of cases){
      const s=f.state,t0=labMicros();
      const raw=arm==="M"?JSON.stringify({v:M.screen(s),hints:M.hints(s)}):
        JSON.stringify({tree:G.screen(s),hints:G.hints(s)});
      const wire=arm==="A"?codec.encode(raw):raw;
      const changed=wire!==prev;
      const dt=labMicros()-t0;
      pu+=dt;maxProducer=Math.max(maxProducer,dt);
      if(changed){
        const t1=labMicros();
        let x=arm==="A"?codec.decode(wire):JSON.parse(wire);
        if(arm==="M")x={tree:materializeManual(x.v),hints:x.hints};
        const dr=labMicros()-t1;
        ru+=dr;maxReceiver=Math.max(maxReceiver,dr);
        bytes+=utf8bytes(wire);packets++;h=checksum(h,JSON.stringify(x));
      }
      prev=wire;
    }
  }
  return JSON.stringify({arm,reps,frames:cases.length*reps,packets,bytes,producerUs:pu,receiverUs:ru,maxProducer,maxReceiver,checksum:h>>>0});
};
})();`;
fs.writeFileSync(process.argv[2],code+'\n');
let t=0;Function('labMicros',code)(()=>++t);
const results=['G','M','A'].map(arm=>JSON.parse(globalThis.renderLabRun(arm,1)));
assert.equal(new Set(results.map(x=>x.checksum)).size,1);
console.log(JSON.stringify({bytes:Buffer.byteLength(code)+1,rehearsal:results}));
