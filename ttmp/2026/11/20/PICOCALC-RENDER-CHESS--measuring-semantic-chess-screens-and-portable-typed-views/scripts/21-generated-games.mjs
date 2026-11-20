// Post-freeze extension. The driver chooses moves solely from the unchanged control's visible canvas.
// Use a fixed seed derived from the frozen implementation; the artifact and schema remain pinned.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {scripts,worldBytes,guest} from './03-guest.mjs';
import {wasm,id,hash,admit,newRunner} from './06-runner.mjs';
const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});
const seedText='postfreeze/730b8cb/chess/20-games/10-white-plies';
let random=parseInt(hash(seedText).slice(0,8),16);
function choose(n){random^=random<<13;random^=random>>>17;random^=random<<5;return (random>>>0)%n;}
const fixed=new WebAssembly.Module(worldBytes(null));
const source=readFileSync(join(scripts,'04-semantic-producer.typed'),'utf8').replace('__DIGEST__',id);
const changed=new WebAssembly.Module(worldBytes(source)),module=admit(wasm);
const ordinary=[],semantic=[],gameLogs=[],positions=new Set();
let count=0,events=0,moves=0;
const square=(x,y)=>y*8+x;
function decode(tree) {
    let cursor=null;
    const destinations=[],whites=[];
    for (const [op,x,y,w,h,c] of tree.kids[1].ops) {
        if (op==='rect' && w===24 && h===24 && c==='#ed492d') cursor=square((x-18)/26,(y-4)/26);
        if (op==='fill' && w===18 && h===20 && c==='#fffbec') whites.push(square((x-21)/26,(y-6)/26));
        if (op==='fill' && w===5 && h===5 && c==='#de781f') destinations.push(square((x-36)/26,(y-22)/26));
    }
    assert(Number.isInteger(cursor)&&cursor>=0&&cursor<64);
    return {cursor,whites,destinations};
}
for(let game=0;game<20;game++){
    const g=guest(fixed), r=guest(changed), draw=newRunner(module);
    let current,controlHints,other,state;
    const log=[];
    function event(method,...args) {
        const a=g[method](...args),b=r[method](...args);
        events++;assert.equal(a.result,b.result);assert.deepEqual(a.effects,b.effects);assert.equal(!!a.screen,!!b.screen);
        if(a.screen){
            count++;
            state=JSON.parse(b.screen[0]);other=draw(state);current=JSON.parse(a.screen[0]);controlHints=a.screen[1].toString();
            assert.equal(other.raw,a.screen[0].toString());assert.equal(other.hints,a.screen[1].toString());
        }
        return a.result;
    }
    function moveTo(target) {
        const at=decode(current).cursor;
        let file=at%8,rank=Math.floor(at/8);
        while(file!==target%8){if(file<target%8){event('key','right');file++;}else{event('key','left');file--;}}
        while(rank!==Math.floor(target/8)){if(rank<Math.floor(target/8)){event('key','down');rank++;}else{event('key','up');rank--;}}
        assert.equal(decode(current).cursor,target);
    }
    function save(ply) {
        const row={id:'generated/'+game+'/'+ply,app:'chess',title:'Chess',tree:current,hints:controlHints};
        ordinary.push(JSON.stringify(row));semantic.push(JSON.stringify({...row,tree:other.tree,hints:other.hints}));
        positions.add(state.b);
        const fresh=newRunner(module)(state);assert.equal(fresh.raw,other.raw);assert.equal(fresh.hints,other.hints);
    }
    event('launch');save(0);
    for(let ply=1;ply<=10;ply++) {
        if(!current.kids[0].s.startsWith('White to move')) break;
        const candidates=decode(current).whites;
        let from,to;
        while(candidates.length) {
            from=candidates.splice(choose(candidates.length),1)[0];
            moveTo(from);event('key','enter');
            const legal=decode(current).destinations;
            if(legal.length){to=legal[choose(legal.length)];break;}
            event('key','esc');
        }
        assert(Number.isInteger(to),'control reported an ongoing game with no playable white move');
        moveTo(to);
        let pending=event('key','enter');
        if(current.kids[0].s.startsWith('Promote to')) pending=event('key','q','q');
        let wakes=0;
        while(pending===1) {pending=event('wake');assert(++wakes<1000);}
        moves++;log.push({from,to,wakes});save(ply);
    }
    gameLogs.push(log);
}
writeFileSync(join(out,'control.ndjson'),ordinary.join('\n')+'\n');
writeFileSync(join(out,'resident.ndjson'),semantic.join('\n')+'\n');
const report={seedText,prng:'xorshift32, SHA-256 first 32 bits',artifact:id,games:20,moves,events,screenCalls:count,settledFrames:ordinary.length,
    distinctPiecePlacements:positions.size,sha256:hash(ordinary.join('\n')),gameLogs};
writeFileSync(join(out,'generated-games.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,gameLogs:undefined}));
