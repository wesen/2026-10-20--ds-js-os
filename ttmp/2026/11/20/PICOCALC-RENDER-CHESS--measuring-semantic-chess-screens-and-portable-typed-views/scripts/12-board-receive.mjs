// Emit a QuickJS capsule for the fixed-cost part shared with the ordinary compositor:
// receive already framed UTF-8 JSON content as a JS string and parse it into owned objects.
// This keeps the WAMR view and the game publisher outside this clock.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const [dir,out]=process.argv.slice(2);assert(out);
const load=file=>readFileSync(join(dir,file),'utf8').trimEnd().split('\n').map(x=>JSON.parse(x));
const screens=load('control.ndjson'),states=load('states.ndjson');
const chosen=[0,screens.findIndex(r=>r.id.includes('e2-e4')),screens.findIndex(r=>r.id.includes('engine wake 78'))];
assert(chosen.every(i=>i>=0));
const data=chosen.map(i=>Object.fromEntries(['generic','semantic'].map(arm=>[arm,JSON.stringify({app:'chess',title:'Chess',frame:
    arm==='generic'?{tree:screens[i].tree,hints:screens[i].hints}:{tree:states[i],hints:''}})])));
writeFileSync(out,'const chessReceiveFrames='+JSON.stringify(data)+';\n'+`
function renderLabRun(arm,reps) {
    if (arm !== 'generic' && arm !== 'semantic') throw Error('unknown arm');
    let consumed=0, bytes=0, parseUs=0;
    for(let round=0;round<reps;round++) for (let i=0;i<chessReceiveFrames.length;i++) {
        const wire=chessReceiveFrames[i][arm];
        const start=labMicros(), envelope=JSON.parse(wire);
        parseUs+=labMicros()-start;
        bytes+=wire.length;
        consumed+=envelope.title.length;
        if(arm==='generic') consumed+=envelope.frame.tree.kids[1].ops.length;
        else consumed+=envelope.frame.tree.b.length;
    }
    return JSON.stringify({frames:reps*chessReceiveFrames.length,parseUs,bytes,consumed});
}
`);
