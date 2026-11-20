// Test the same binary encoder against the three already-qualified resident semantic views.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const dir=dirname(fileURLToPath(import.meta.url)), day=resolve(dir,'../..');
const ticket=n=>join(day,readdirSync(day).find(s=>s.startsWith('PICOCALC-RENDER-'+n+'--')));
const read=p=>readFileSync(p,'utf8'), nd=p=>read(p).trim().split('\n').map(JSON.parse);
const hash=s=>createHash('sha256').update(s).digest('hex');
const codecFile=join(ticket('BINARY'),'scripts/02-binary-screen.js');
const codec=vm.runInThisContext('(function(){'+read(codecFile)+';return binaryScreen})()');
const sys=ticket('SYSTEM'), req=createRequire(import.meta.url);
const {ui}=req(join(sys,'scripts/04-harness.cjs'));
const systemDraw=Function('ui',read(join(sys,'scripts/06-manual-receiver.js'))+'; return materializeManual')(ui);
const snake=await import(pathToFileURL(join(ticket('SNAKE'),'scripts/06-semantic.mjs')));
const chess=await import(pathToFileURL(join(ticket('CHESS'),'scripts/06-runner.mjs')));
const chessDraw=chess.newRunner(chess.admit(chess.wasm));
const clean=s=>({tree:s.tree,hints:s.hints});
const studies=[
  ['System',nd(join(sys,'various/sysmon-manual-wire.ndjson')).map(r=>JSON.parse(r.wire)),
   p=>({tree:systemDraw(p.v),hints:p.hints})],
  ['Snake',nd(join(process.argv[3]||'/tmp/picocalc-snake-study','states.ndjson')).map(({id,...state})=>state),p=>clean(snake.template(p))],
  ['Chess',nd(join(process.argv[4]||'/tmp/chess-render-experiment','states.ndjson')),p=>clean(chessDraw(p))],
];
const results={codecSHA256:hash(read(codecFile)),scope:'Direct typed byte buffer between encode and resident view on host. Uses original semantic values, before any JSON conversion. Compares reconstructed screens with reference from the same original view. Historical fixture file loading and output verification are outside the wire interval.'};
for(const [name,states,draw] of studies){
    let posted=0,txt=0,bin=0,b64=0,last=null;
    const h=createHash('sha256');
    for(const state of states){
        const full=JSON.stringify(state),bytes=codec.encode(state),indexed=codec.admit(bytes);
        const candidate=draw(indexed.view(indexed.root)),control=draw(JSON.parse(full));
        assert.deepEqual(JSON.parse(JSON.stringify(candidate)),JSON.parse(JSON.stringify(control)));
        h.update(JSON.stringify(control)+'\n');
        if(full===last)continue;
        last=full;posted++;txt+=Buffer.byteLength(full);bin+=bytes.length;b64+=4*Math.ceil(bytes.length/3);
    }
    results[name]={attempts:states.length,immediateChanges:posted,jsonPayloadBytes:txt,binaryPayloadBytes:bin,base64PayloadBytes:b64,
        binaryOverJSON:bin/txt,screenSHA256:h.digest('hex')};
}
writeFileSync(process.argv[2],JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results));
