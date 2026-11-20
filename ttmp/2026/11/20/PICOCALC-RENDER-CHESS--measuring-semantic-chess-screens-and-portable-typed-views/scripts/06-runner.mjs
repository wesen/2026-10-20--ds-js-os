// Host profile for one pinned, import-free renderer. Admission is deliberately an allowlist.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {scripts} from './03-guest.mjs';

export const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
export const source=readFileSync(join(scripts,'05-closed-view.typed'),'utf8');
// The preinstalled specimen is independent of today's compiler; a fresh host can time its first source compile.
export const wasm=readFileSync(join(scripts,'../various/view.wasm'));
export const id='63d752c673c41636e4951c0f9a95ba7b7f69f698d98ed723e39037a3bc7fb026';
assert.equal(hash(wasm),id);
export const abi=1;
const inputOffset=0, metaOffset=160, outOffset=224, hintOffset=16616;
const outputLimit=8192, hintLimit=120;

function checkFields(s) {
    if (s.v!==abi || s.p!==id || typeof s.b!=='string' || !/^[0-69a-e]{64}$/.test(s.b) ||
        typeof s.m!=='string' || !/^[0-9a-f]{16}$/.test(s.m) || !Array.isArray(s.f) || s.f.length!==9)
        throw Error('unsupported view identity or malformed state');
    const [cursor,selected,from,to,status,hint,depth,nodes,score]=s.f;
    const max=[63,64,64,64,8,1,32,2147483647,2147483647];
    if(s.f.some((v,i)=>!Number.isInteger(v)||v>(max[i])||v<(i===8?-2147483647:0))||
       ((from===64)!==(to===64))||[...s.b].filter(v=>v!=='0').length>32||
       (selected===64 && s.m!=='0000000000000000')) throw Error('semantic fields out of range');
}

export function newRunner(module) {
    assert.deepEqual(WebAssembly.Module.imports(module),[]);
    const instance=new WebAssembly.Instance(module,{}).exports;
    const memory=instance.memory.buffer;
    assert.equal(memory.byteLength,65536);
    const words=new DataView(memory);
    const position=new Uint16Array(memory,inputOffset+4,72);
    words.setUint32(inputOffset,72,true);
    words.setUint32(outOffset,outputLimit,true);
    words.setUint32(hintOffset,hintLimit,true);
    const text=(p,n)=>Buffer.from(memory,p+4,n*2).toString('utf16le');
    return function draw(s) {
        checkFields(s);
        for(let i=0;i<64;i++) position[i]=parseInt(s.b[i],16);
        for(let i=0;i<8;i++) position[64+i]=parseInt(s.m.slice(2*i,2*i+2),16);
        s.f.forEach((v,i)=>words.setInt32(metaOffset+4*i,v,true));
        const result=instance.render(inputOffset,metaOffset,outOffset,hintOffset);
        const length=Math.floor(result/128), hintLength=result%128;
        if(length<=0 || length>outputLimit || hintLength<0 || hintLength>hintLimit) throw Error('invalid output lengths');
        const raw=text(outOffset,length), hints=text(hintOffset,hintLength),tree=JSON.parse(raw);
        const ops=tree.kids[1].ops;
        if(tree.kids.length>3 || tree.kids[1].w!==228 || tree.kids[1].h!==228 || ops.length>212) throw Error('invalid view output');
        return {tree,hints,raw};
    };
}

export function admit(bytes) {
    if(bytes.length>16384 || hash(bytes)!==id) throw Error('unknown view artifact');
    return new WebAssembly.Module(bytes);
}

// Install transfers carry an actual 8-byte CHV1/kind/ABI/length prefix and payload.
// The local cache includes source identity, ABI and the actual compiler source identity.
export const compilerId=hash(readFileSync(new URL('../../../../../../picocalc-os/compiler/typed-wasm.js',import.meta.url)));
export function transfer(kind,payload) {
    const body=Buffer.from(payload), head=Buffer.alloc(8);
    if(body.length>16384) throw Error('install payload too large');
    head.write('CHV1'); head[4]=kind;head[5]=abi;head.writeUInt16LE(body.length,6);
    return Buffer.concat([head,body]);
}
export function installer(approvedSourceDigests = new Set([hash(source)])) {
    const cache=new Map();
    return packet=>{
        if(packet.length<8 || packet.toString('ascii',0,4)!=='CHV1' || packet[5]!==abi ||
           packet.readUInt16LE(6)!==packet.length-8 || packet.length>16392) throw Error('invalid install envelope');
        const kind=packet[4], bytes=Buffer.from(packet.subarray(8));
        if(kind!==1 && kind!==2) throw Error('unknown delivery kind');
        const key=[kind,abi,compilerId,hash(bytes)].join('/');
        if(cache.has(key)) return {module:cache.get(key),hit:true};
        if(kind===2 && !approvedSourceDigests.has(hash(bytes))) throw Error('unapproved typed source');
        const executable=kind===1?bytes:typedWasm.compile(bytes.toString('utf8')).bytes;
        const module=admit(executable);
        cache.set(key,module);
        return {module,hit:false};
    };
}
export function post(screen) {
    // Exact JSON punctuation/order of native.c NW_SCREEN and kernel.c frame_message.
    return Buffer.from('{"app":"chess","title":"Chess","frame":{"tree":'+screen[0].toString('utf8')+',"hints":'+JSON.stringify(screen[1].toString('utf8'))+'}}');
}

export function retained(module) {
    const draw=newRunner(module);
    let accepted=null;
    return {
        publish(bytes) {
            const value=Buffer.from(bytes);
            if(value.length>512) throw Error('semantic packet too large');
            const screen=draw(JSON.parse(value.toString()));
            accepted=value;
            return screen;
        },
        restart() {
            if(!accepted) throw Error('no last-good frame');
            return newRunner(module)(JSON.parse(accepted.toString()));
        }
    };
}
