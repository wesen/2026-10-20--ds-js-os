// This decoder consumes final bytes. It shares no instruction or lowering helpers with the emitter.
function need(condition,message) {if (!condition) throw new Error(message);}
const sign=(n,b)=>(n<<(32-b))>>(32-b);
function jump(w) {return sign(((w>>>31)<<20)|(((w>>>12)&255)<<12)|(((w>>>20)&1)<<11)|(((w>>>21)&1023)<<1),21);}
function branch(w) {return sign(((w>>>31)<<12)|(((w>>>7)&1)<<11)|(((w>>>25)&63)<<5)|(((w>>>8)&15)<<1),13);}
const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const read=(v,i)=>v.getUint32(i,true);
export function checkedSlot(elf,programBytes,entryNames,importNames,entries){
    const v=view(elf), ph=read(v,28), matches=[], exec=[];
    need(read(v,0)===0x464c457f && elf[4]===1 && elf[5]===1 && v.getUint16(18,true)===243,'ELF header');
    const stride=v.getUint16(42,true),count=v.getUint16(44,true);
    need(stride===32 && ph+count*stride<=elf.length,'program headers');
    for(let i=0;i<count;i++){
        const p=ph+i*stride;if(read(v,p)!==1||!(read(v,p+24)&1))continue;
        const from=read(v,p+4),end=from+read(v,p+16);need(end<=elf.length,'segment extent');
        exec.push([read(v,p+8),read(v,p+8)+(end-from)]);
        for(let at=from+(4-from%4)%4;at+20<=end;at+=4){
            if(read(v,at)===0x4147454e && read(v,at+4)===0x44415256 && read(v,at+8)===0x3332534c)matches.push([at,end,read(v,p+8)-from]);
        }
    }
    need(matches.length===1,'unique slot');const [slot,end,delta]=matches[0],external=new Map();
    const capacity=read(v,slot+12), ext=slot+20+4*entryNames.length, code=ext+4*importNames.length;
    need(read(v,slot+16)===entryNames.length+65536*importNames.length && slot+capacity<=end && code+programBytes<=slot+capacity,'slot envelope');
    for(const [i,name] of entryNames.entries()){
        const pc=slot+20+4*i,w=read(v,pc);need((w&4095)===0x6f && pc+jump(w)===code+entries[name],'SDK entry stub');
    }
    for(const [i,name] of importNames.entries()){
        const pc=ext+4*i,w=read(v,pc);
        const dest=pc+delta+jump(w);
        need((w&4095)===0x6f && (dest<slot+delta || dest>=slot+delta+capacity) && exec.some(([lo,hi])=>dest>=lo && dest<hi),'import trampoline');
        external.set(pc-code,name);
    }
    return {bytes:elf.subarray(code,code+programBytes),external};
}

export function check(bytes, entries, claims, external=new Map()){
    const v=view(bytes), sorted=Object.entries(entries).sort((a,b)=>a[1]-b[1]);
    need(sorted.length && sorted[0][1]===0 && sorted.length===claims.length,'function partition');
    const byPC=new Map(sorted.map(([name,pc])=>[pc,name])), result=new Map();
    for(let i=0;i<sorted.length;i++){
        const [name,start]=sorted[i],end=i+1<sorted.length?sorted[i+1][1]:bytes.length;
        const c=claims[i], calls=[], ep=end-12;
        need(start%4===0 && end%4===0 && end-start>=20 && c.name===name && c.start===start && c.size===end-start,'extent '+name);
        const pro=read(v,start),frame=-(pro>>20);
        need((pro&0xfffff)===0x10113 && frame>=16 && frame<=2032 && frame%16===0 && c.frame===frame && c.raSlot===frame-4,'frame '+name);
        need(read(v,ep+4)===((frame<<20)|0x10113)>>>0 && read(v,ep+8)===0x8067,'return '+name);
        const raOffset=frame-4;
        function control(to){need(to%4===0 && to>=start+8 && to<=ep,'local branch target '+name);}
        for(let pc=start+4;pc<end;pc+=4){
            const w=read(v,pc),op=w&127,rd=(w>>>7)&31,f3=(w>>>12)&7,rs=(w>>>15)&31,rt=(w>>>20)&31,f7=w>>>25;
            const simm=sign(((w>>>25)<<5)|((w>>>7)&31),12), imm=w>>20;
            if(pc===start+4){need(op===0x23&&f3===2&&rs===2&&rt===1&&simm===raOffset,'RA save');continue;}
            if(pc===ep){need(op===3&&f3===2&&rs===2&&rd===1&&imm===raOffset,'RA restore');continue;}
            if(pc>ep)continue;
            if(op===0x6f){
                const to=pc+jump(w);
                if(rd===0)control(to);
                else {
                    need(rd===1 && (byPC.has(to)||external.has(to)),'direct target '+name);
                    calls.push({at:pc-start,name:byPC.get(to)??external.get(to),external:external.has(to)});
                }
                continue;
            }
            if(op===0x63){need([0,1,4,5,6,7].includes(f3)&&rs!==2&&rt!==2,'conditional');control(pc+branch(w));continue;}
            if(w===0x00100073)continue;
            if(op===0x03 || op===0x23){
                const load=op===3;
                need(load?[2,5].includes(f3):[1,2].includes(f3),'memory operation '+name);
                need(load?(rd!==1&&rd!==2):(rt!==1&&rt!==2),'reserved data register');
                if(rs===2){
                    const off=load?imm:simm, width=f3===2?4:2;
                    need(off>=0 && off%width===0 && off+width<=raOffset,'stack slot '+name);
                }
                continue;
            }
            const alu=op===0x33 && ((f7===0&&[0,1,2,3,4,5].includes(f3))||(f7===32&&[0,5].includes(f3))||(f7===1&&[0,4,6].includes(f3)));
            const immediate=op===0x13 && [0,3,4].includes(f3);
            need((alu||immediate||op===0x37) && rd!==2 && rd!==1 && (op===0x37 || (rs!==2 && rs!==1)) && (!alu || (rt!==2 && rt!==1)),'unsupported word '+name+' '+w.toString(16));
        }
        need(calls.length===c.calls.length && calls.every((call,j)=>['at','name','external'].every(k=>call[k]===c.calls[j][k])),'call evidence '+name);
        result.set(name,{name,frame,calls});
    }
    const busy=new Set();
    function bound(name){
        const row=result.get(name);if(row.typed!==undefined)return row;
        need(!busy.has(name),'recursive cycle '+name);busy.add(name);
        const sdk=new Map();let peak=row.frame;
        for(const call of row.calls) {
            if(call.external){sdk.set(call.name,Math.max(sdk.get(call.name)||0,row.frame));continue;}
            const child=bound(call.name);peak=Math.max(peak,row.frame+child.typed);
            for(const [ext,n] of Object.entries(child.sdk)) sdk.set(ext,Math.max(sdk.get(ext)||0,row.frame+n));
        }
        row.typed=peak;row.sdk=Object.fromEntries(sdk);busy.delete(name);return row;
    }
    for(const [name] of sorted)bound(name);
    return Object.fromEntries(result);
}
