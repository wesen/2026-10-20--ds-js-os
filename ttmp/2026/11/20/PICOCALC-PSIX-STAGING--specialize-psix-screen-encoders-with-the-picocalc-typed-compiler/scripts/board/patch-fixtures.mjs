// Sample genuine application states with three dictionary layouts in one legal position.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInThisContext} from 'node:vm';
import {worldBytes, guest, seed, scripts} from '../../../PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/scripts/03-guest.mjs';
import {admit, id, newRunner, wasm} from '../../../PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/scripts/06-runner.mjs';

const target = process.argv[2];
assert(target, 'usage: node patch-fixtures.mjs OUTPUT_DIRECTORY');
mkdirSync(target, {recursive:true});

const day = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const reference = join(day, 'PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js');
const codec = runInThisContext(readFileSync(reference,'utf8') + ';binaryScreen');
const fen = '8/R6R/8/3k4/8/8/8/K7 w - - 0 1';
const setup = seed(fen, '    state.cursor = 16;');
const semanticSource = readFileSync(join(scripts,'04-semantic-producer.typed'),'utf8').replace('__DIGEST__',id);
const ordinary = guest(worldBytes(null,setup));
const semantic = guest(worldBytes(semanticSource,setup));
const draw = newRunner(admit(wasm));
const raw = [];
const vocabulary = ['', 'Chess', 'app', 'b', 'chess', 'f', 'frame', 'hints', 'm', 'p', 'title', 'tree', 'v', id];

function classOf(state) {
    const ranks = [state.b, state.m].map(s => vocabulary.filter(t => t < s).length);
    const wide = state.f.reduce((mask,v,i) => mask | ((v < -524288 || v > 524287) ? 1 << i : 0), 0);
    return [...ranks, Number(state.b < state.m), wide].join('/');
}
function event(label, type, ...args) {
    const a = ordinary[type](...args), b = semantic[type](...args);
    assert.equal(a.result,b.result,label);
    assert.deepEqual(a.effects,b.effects,label);
    assert(a.screen && b.screen,label);
    const state = JSON.parse(b.screen[0]);
    const rendered = draw(state);
    assert.equal(rendered.raw,a.screen[0].toString(),label);
    assert.equal(rendered.hints,a.screen[1].toString(),label);
    const payload = {app:'chess',title:'Chess',frame:{tree:state,hints:''}};
    const row = {label,state,class:classOf(state),payload,bytes:[...codec.encode(payload)]};
    raw.push(row);
    return row;
}

const a = event('launch','launch');
const b = event('select a7 rook','key','enter');
assert.deepEqual([a.state.f[1],b.state.f[1]],[64,8]);
assert.equal(b.state.m.slice(0,2),'01');
event('clear a7 selection','key','esc');
for (let i = 0; i < 7; ++i) event('right '+(i+1),'key','right');
const c = event('select h7 rook','key','enter');
assert.equal(c.state.f[1],15);
assert.equal(c.state.m.slice(0,2),'80');
event('clear h7 selection','key','esc');
for (let i = 0; i < 7; ++i) event('left '+(i+1),'key','left');
event('select a7 again','key','enter');
assert.equal(new Set([a,b,c].map(r=>r.class)).size,3);
assert(raw.every(row => row.state.b === a.state.b), 'selection changes the mask, preserving the board');

const list = a => '{'+a.join(',')+'}';
const units = s => [...s.b].map(x=>parseInt(x,16)).concat([...Buffer.from(s.m,'hex')],
    s.f.flatMap(x=>[x&65535,(x>>>16)&65535]));
function writeGroup(name, rows) {
    const members = rows.map(({state,label,bytes,payload})=> {
        const input = units(state);
        assert.equal(input.length,90);
        return '{'+JSON.stringify(label)+',{90,'+list(input)+'},'+JSON.stringify(JSON.stringify(payload))+','+
            bytes.length+','+list(bytes)+'}';
    });
    return 'static const struct stage_patch_fixture '+name+'[] = {\n'+members.join(',\n')+'\n};\n';
}
const sampled = [a,b,c];
const header = '/* Derived from the physical-profile semantic producer executed in Wasm. */\n'+
    'struct stage_patch_fixture { const char *label; struct stage_input input; const char *json; unsigned length; uint8_t wire[576]; };\n'+
    writeGroup('stage_patch_churn',sampled)+writeGroup('stage_patch_replay',raw);
writeFileSync(join(target,'stage_churn.h'),header);

function counts(sequence) {
    const recent = [];
    let hits=0, misses=0;
    for (const row of sequence) {
        const i = recent.indexOf(row.class);
        if(i < 0) misses++;
        else {hits++; recent.splice(i,1);}
        recent.unshift(row.class);
        recent.length = Math.min(2,recent.length);
    }
    return {calls:sequence.length, classes:new Set(sequence.map(r=>r.class)).size, hits, misses};
}
const repeated = Array.from({length:8},()=>sampled).flat();
const report = {fen, witness:sampled.map(({label,class:key,state})=>({label,key,mask:state.m})),
    chronological:counts(raw), sampledCycle:counts(repeated),
    events:raw.map(({label,class:key,state})=>({label,key,mask:state.m,selected:state.f[1]}))};
writeFileSync(join(target,'churn-receipt.json'),JSON.stringify(report,null,2)+'\n');
writeFileSync(join(target,'churn-states.ndjson'),sampled.map(({state})=>JSON.stringify(state)).join('\n')+'\n');
console.log(JSON.stringify({chronological:report.chronological,sampledCycle:report.sampledCycle,witness:report.witness}));
