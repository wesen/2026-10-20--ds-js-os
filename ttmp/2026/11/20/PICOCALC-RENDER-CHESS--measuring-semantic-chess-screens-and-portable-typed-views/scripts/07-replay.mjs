import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {worldBytes,guest,scripts,seed,reactor} from './03-guest.mjs';
import {wasm,id,abi,source,hash,admit,retained,post} from './06-runner.mjs';

const directory=process.argv[2];
assert(directory,'usage: node 07-replay.mjs OUTPUT_DIRECTORY');
mkdirSync(directory,{recursive:true});
const producer=readFileSync(join(scripts,'04-semantic-producer.typed'),'utf8').replace('__DIGEST__',id);
const resident=admit(wasm), receiver=retained(resident);
const rows=[], G=[],R=[], A=[],states=[],eventLog=[];
const format=(id,tree,hints)=>JSON.stringify({id,app:'chess',title:'Chess',tree,hints});
const groups=[
    ['opening',null],
    ['promotion',seed('7k/P7/8/8/8/8/8/7K w','    state.cursor = 16;')],
    ['in-check',seed('k6r/8/8/8/8/8/8/7K w')],
    ['white-mate',seed('7k/6Q1/6K1/8/8/8/8/8 b')],
    ['black-mate',seed('8/8/8/8/8/6k1/6q1/7K w')],
    ['stalemate',seed('7k/5Q2/6K1/8/8/8/8/8 b')],
    ['dead-material',seed('7k/8/8/8/8/8/8/7K w')],
    ['castle-short',seed('r3k2r/8/8/8/8/8/8/R3K2R w','    board.setCharCodeAt(129, 15);\n    state.cursor = 116;')],
    ['castle-long',seed('r3k2r/8/8/8/8/8/8/R3K2R w','    board.setCharCodeAt(129, 15);\n    state.cursor = 116;')],
    ['en-passant',seed('7k/8/8/3pP3/8/8/8/7K w','    board.setCharCodeAt(130, 35);\n    state.cursor = 52;')],
    ['signed-statistics',seed('r3k2r/8/8/8/8/8/8/R3K2R w','    state.lastMove = chessMove(4, 5, 0);\n    state.completed = 4;\n    state.nodes = 3210;\n    state.score = -77;')]
];
const controls={};
for (const [group,fixture] of groups) {
    const ordinary=worldBytes(null,fixture), semantic=worldBytes(producer,fixture);
    const g=guest(ordinary), aa=guest(ordinary), r=guest(semantic);
    controls[group]=[hash(ordinary),hash(semantic)];
    let turn=0,last=undefined;
    function event(label,operation,...args) {
        const id=group+'/'+String(turn++).padStart(3,'0')+' '+label;
        const ga=g[operation](...args), ab=aa[operation](...args), ra=r[operation](...args);
        assert.equal(ab.result,ga.result);assert.deepEqual(ab.effects,ga.effects);assert.deepEqual(ab.screen,ga.screen);
        assert.equal(ra.result,ga.result);assert.deepEqual(ra.effects,ga.effects);assert.equal(!!ra.screen,!!ga.screen);
        eventLog.push({id,result:ga.result,schedules:ga.effects.length,screen:!!ga.screen});
        if(!ga.screen) return {result:ga.result,frame:null};
        const generic=JSON.parse(ga.screen[0]), hints=ga.screen[1].toString();
        const frame=receiver.publish(ra.screen[0]);
        assert.equal(frame.raw,ga.screen[0].toString(),id);assert.equal(frame.hints,hints,id);
        assert.deepEqual(receiver.restart(),frame,id+' producer-idle replay');
        const gPost=post(ga.screen),rPost=post(ra.screen);
        const changed=last===undefined || last!==gPost.toString();
        if(last!==undefined) assert.equal(changed,rLast!==rPost.toString(),'matched dedup '+id);
        last=gPost.toString();rLast=rPost.toString();
        G.push(format(id,generic,hints));A.push(format(id,JSON.parse(ab.screen[0]),ab.screen[1].toString()));R.push(format(id,frame.tree,frame.hints));
        states.push(ra.screen[0].toString());
        rows.push({id,changed,controlBody:ga.screen[0].length+ga.screen[1].length,semanticBody:ra.screen[0].length,
            controlPost:gPost.length,semanticPost:rPost.length,ops:generic.kids[1].ops.length,hints,status:generic.kids[0].s,
            footer:generic.kids[2]?.s??null,outputSha256:hash(Buffer.concat(ga.screen)),stateSha256:hash(ra.screen[0])});
        return {result:ga.result,frame,semantic:JSON.parse(ra.screen[0])};
    }
    let rLast;
    const key=(name,ch='',label=name)=>event(label,'key',name,ch);
    const first=event('launch','launch'),status=first.frame.tree.kids[0].s;
    if(group==='opening') {
        key('x','x','unhandled printable key');
        key('up'); assert.equal(key('enter').frame.tree.kids[0].s,'Please choose a legal move');
        key('down');key('enter');key('esc');key('enter');
        assert.equal(event('key release','key','up','','up').frame,null);
        key('up');key('up'); const play=key('enter','','e2-e4');
        assert.equal(play.frame.tree.kids[0].s,'Black is thinking');
        assert.equal(event('unknown wake','wake',9000).frame,null);
        key('right','','cursor during search');
        let ticks=0,reply;
        do {reply=event('engine wake '+(++ticks),'wake');assert(ticks<1000);}while(reply.result===1);
        assert.equal(ticks,78);
        assert.equal(reply.frame.tree.kids[2].s,'Last b8-c6   Depth 3   Nodes 1600   Eval 12');
        key('f2');key('enter');key('up');key('up');key('enter');key('f2');
        assert.equal(event('stale wake after reset','wake').frame,null);
    } else if(group==='promotion') {
        key('enter');key('up');
        let prompt=key('enter');
        assert.equal(prompt.frame.hints,'Q R B N promote   Esc cancel');key('esc');
        prompt=key('enter');assert.equal(prompt.frame.tree.kids[0].s,'Promote to Q, R, B or N');
        const moved=key('n','n','underpromote a8=N');
        assert.equal(moved.semantic.b[0],'2');assert.equal(moved.frame.tree.kids[0].s,'Draw - dead material');
    } else if(group.startsWith('castle')) {
        assert.equal(status,'White to move');key('enter');
        const short=group==='castle-short';
        key(short?'right':'left');key(short?'right':'left');const moved=key('enter');
        assert.equal(moved.semantic.b.slice(56),short?'40000460':'00640004');
    } else if(group==='en-passant') {
        key('enter');key('left');key('up');const moved=key('enter');
        assert.equal(moved.semantic.b[19],'1');assert.equal(moved.semantic.b[27],'0');
    } else if(group==='signed-statistics') {
        assert.equal(first.frame.tree.kids[2].s,'Last e8-f8   Depth 4   Nodes 3210   Eval -77');
    } else {
        assert.equal(status,({'in-check':'White to move - check','white-mate':'Checkmate - White wins',
            'black-mate':'Checkmate - Black wins',stalemate:'Draw - stalemate','dead-material':'Draw - dead material'})[group]);
    }
}
const valid=Buffer.from(states[0]); const before=receiver.publish(valid);
for(const invalid of [Buffer.from('{'),Buffer.alloc(513,65),Buffer.from(states[0].replace('"v":1','"v":2')),
    Buffer.from(states[0].replace(id,'0'.repeat(64))),Buffer.from(states[0].replace('"f":[52','"f":[65'))]) {
    assert.throws(()=>receiver.publish(invalid));assert.deepEqual(receiver.restart(),before);
}
// A state accepted after rejection must replace the previous retained packet.
const after=receiver.publish(Buffer.from(states.at(-1)));assert.deepEqual(receiver.restart(),after);assert.notDeepEqual(before,after);
for(const [file,lines] of [['control',G],['control-aa',A],['resident',R],['states',states]])
    writeFileSync(join(directory,file+'.ndjson'),lines.join('\n')+'\n');
writeFileSync(join(directory,'view.wasm'),wasm);
writeFileSync(join(directory,'semantic-producer.typed'),producer);
const receipt={node:process.version,id,abi,reactor:hash(reactor),source:hash(source),moduleBytes:wasm.length,sourceBytes:Buffer.byteLength(source),
    groups:controls,events:eventLog.length,screenCalls:rows.length,changedPosts:rows.filter(r=>r.changed).length,retainedReplay:rows.length,
    invalidStates:5,traceSha256:hash(JSON.stringify(eventLog)),orderedScreensSha256:hash(G.join('\n')),rows,eventLog};
writeFileSync(join(directory,'replay.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({events:receipt.events,screenCalls:rows.length,changedPosts:receipt.changedPosts,groups:groups.length,artifact:id}));
