// The control and semantic worlds get distinct memories, event streams and syscall captures.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-async.js';
import '../../../../../../picocalc-os/compiler/typed-world.js';

export const scripts = fileURLToPath(new URL('.', import.meta.url));
export const root = resolve(scripts, '../../../../../..');
const dir = join(root, 'picocalc-os/worlds/chess');
const parts = readFileSync(join(dir, 'source.list'), 'utf8').trim().split('\n');
const original = Object.fromEntries(parts.map(file => [file, readFileSync(join(dir,file), 'utf8')]));
export const reactor = readFileSync(join(root, 'picocalc-os/build/typed-world-reactor.wasm'));
const operations = [...readFileSync(join(root, 'picocalc-os/sdk/nw_wire.h'), 'utf8').matchAll(/NW_CALL_([A-Z_]+)/g)].map(m=>m[1]);

export function worldBytes(producer, fixture = null) {
    const sources = {...original};
    if (producer) {
        const view = sources['view.typed'];
        const helper = name => {
            const start = view.indexOf('function '+name+'(');
            const end = view.indexOf('\nfunction ',start+1);
            assert(start>=0 && end>start);
            return view.slice(start,end);
        };
        sources['view.typed'] = [helper('chessAppendNumber'),helper('chessMarkDestinations'),producer].join('\n');
    }
    if (fixture) {
        // Change only new-game initialization in both arms, then exercise the regular event entry.
        const anchor = '    state.nodes = 0;\n    return 0;';
        assert(sources['chess.typed'].includes(anchor));
        sources['chess.typed'] = sources['chess.typed'].replace(anchor, '    state.nodes = 0;\n'+fixture+'\n    return 0;');
    }
    const source = parts.map(file => sources[file]+'\n').join('');
    return compileTypedWorld(source, reactor);
}

export function guest(bytes) {
    let instance, lastScreen, timer = 2000;
    const effects = [];
    const denied = () => { throw Error('Unexpected WASI call'); };
    const call = (op,a,b,c,p,n,q,m) => {
        switch (operations[op-1]) {
        case 'KIND': case 'PRESENT': return 0n;
        case 'SLEEP': effects.push(++timer); return BigInt(timer);
        case 'SCREEN':
            // In both arms the clock includes SDK conversion and the two byte copies.
            lastScreen = [Buffer.from(new Uint8Array(instance.memory.buffer,p,n)), Buffer.from(new Uint8Array(instance.memory.buffer,q,m))];
            return 0n;
        default: throw Error('Unexpected syscall '+operations[op-1]);
        }
    };
    instance = new WebAssembly.Instance(bytes instanceof WebAssembly.Module ? bytes : new WebAssembly.Module(bytes), {
        nw: {call,error:()=>0}, wasi_snapshot_preview1: {fd_write:denied,fd_seek:denied,fd_close:denied}
    }).exports;
    instance._initialize?.(); instance.nw_wasm_init();
    function event(kind,ok,token,name,value,sender) {
        const args=[name,value,sender].map(s=>Buffer.from(s));
        const memory = new Uint8Array(instance.memory.buffer);
        let p=instance.nw_wasm_buffer(args.reduce((n,b)=>n+b.length+1,0)); assert(p>0);
        for (const arg of args) { memory.set(arg,p); p+=arg.length; memory[p++]=0; }
        lastScreen=null; effects.length=0;
        const start=performance.now();
        const result=instance.nw_wasm_event(kind,ok,0,token,...args.map(a=>a.length));
        const eventUs=(performance.now()-start)*1000;
        return {result,screen:lastScreen,effects:effects.slice(),eventUs};
    }
    return {
        launch:()=>event(2,0,0,'','null',''),
        key:(key,ch='',state='down')=>event(0,0,0,'key',JSON.stringify({key,ch,state}),'compositor'),
        wake:(delta=0,ok=1)=>event(4,ok,timer+delta,'','null','')
    };
}

// FEN fields supply the position only. Each fixture explicitly supplies matching status/selection metadata.
// Rank order here and in the view is a8..h8, through a1..h1.
export function seed(fen, fields = '') {
    const [ranks,side] = fen.split(' ');
    const pieces=' PNBRQK  pnbrqk';
    let body='    for (let i = 0; i < 128; i = i + 1) { board.setCharCodeAt(i, 0); }\n';
    const king=[];
    for(const [rank,line] of ranks.split('/').entries()) {
        let file=0;
        for(const char of line) {
            if (/^[1-8]$/.test(char)) {file+=Number(char);continue;}
            const value=pieces.indexOf(char), square=rank*16+file++;
            assert(value>0);
            body+='    board.setCharCodeAt('+square+', '+value+');\n';
            if(value%8===6) king[value<8?0:1]=square;
        }
        assert.equal(file,8);
    }
    for(const [at,value] of [[128,Number(side==='b')],[129,0],[130,128],[131,king[0]],[132,king[1]]]) {
        assert(Number.isInteger(value)); body+='    board.setCharCodeAt('+at+', '+value+');\n';
    }
    return body+'    state.outcome = chessOutcome(board);\n'+fields;
}
