// Experimental fixed-record reader for immutable ECMAScript strings.
// Offsets are UTF-16 code units. Admission independently counts encoded UTF-8 bytes.
function utf8Size(text) {
    let total = 0;
    for (let i=0; i<text.length; i++) {
        const u=text.charCodeAt(i);
        if (u>=0xd800 && u<=0xdbff && i+1<text.length && (text.charCodeAt(i+1)&0xfc00)===0xdc00) {
            total+=4; i++;
        } else total+=u<128 ? 1 : u<2048 ? 2 : 3;
    }
    return total;
}
function indexScreen(text, records=new Uint16Array(4096*4), limits={bytes:16384, depth:40, string:8192}) {
    if (text.length>65534 || utf8Size(text)>limits.bytes) throw Error('bytes');
    let pos=0, used=0;
    const white=()=>{while (' \r\n\t'.includes(text[pos]) && pos<text.length) pos++;};
    const fail=()=>{throw Error('syntax');};
    function string() {
        const start=pos++;
        let units=0;
        while(pos<text.length) {
            const ch=text.charCodeAt(pos++);
            if(ch===34) return;
            if(ch<32) fail();
            if(++units>limits.string) throw Error('string');
            if(ch===92) {
                const e=text[pos++];
                if(e==='u') {for(let k=0;k<4;k++) if(!/[0-9a-f]/i.test(text.charAt(pos++))) fail();}
                else if(!e || !'"\\/bfnrt'.includes(e)) fail();
            }
        }
        fail();
    }
    const num=/-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    function value(depth) {
        white();
        if(depth>limits.depth) throw Error('depth');
        if((used+1)*4>records.length) throw Error('tokens');
        const slot=used++*4, start=pos, ch=text[pos];
        let count=0;
        if(ch==='{' || ch==='[') {
            pos++; white();
            const close=ch==='{' ? '}' : ']';
            if(text[pos]!==close) for(;;) {
                if(ch==='{') {if(text[pos]!=='"') fail(); value(depth+1); white(); if(text[pos++]!==':') fail();}
                value(depth+1); count++; white();
                if(text[pos]!==',') break;
                pos++; white();
            }
            if(text[pos++]!==close) fail();
        } else if(ch==='"') string();
        else if(text.startsWith('true',pos)) pos+=4;
        else if(text.startsWith('false',pos)) pos+=5;
        else if(text.startsWith('null',pos)) pos+=4;
        else {num.lastIndex=pos;if(!num.test(text)) fail();pos=num.lastIndex;}
        records[slot]=start; records[slot+1]=pos;records[slot+2]=used;records[slot+3]=count;
    }
    value(0); white(); if(pos!==text.length) fail();
    const next=i=>records[i*4+2];
    const tag=i=>text[records[i*4]];
    const scalar=i=>JSON.parse(text.slice(records[i*4],records[i*4+1]));
    function lookup(i,key) {
        let found=-1;
        for(let k=i+1;k<next(i);) {
            const v=k+1;
            if(scalar(k)===key) found=v;
            k=next(v);
        }
        return found; // Last occurrence wins, matching JSON.parse.
    }
    function child(i,k) {
        if(k<0 || k>=records[i*4+3]) return -1;
        let j=i+1;
        while(k--) j=next(j);
        return j;
    }
    function material(i=0) {
        switch(tag(i)) {
            case '[': {const a=[];for(let j=i+1;j<next(i);j=next(j)) a.push(material(j));return a;}
            case '{': {const o=Object.create(null);for(let j=i+1;j<next(i);j=next(j+1)) o[scalar(j)]=material(j+1);return o;}
            default:return scalar(i);
        }
    }
    function view(i=0) {
        const kind=tag(i);
        if(kind!=='[' && kind!=='{') return scalar(i);
        const array=kind==='[';
        const idx=key=>typeof key==='string' && /^(0|[1-9]\d*)$/.test(key);
        return new Proxy(array?[]:Object.create(null),{
            get(target,key) {
                if(array) {
                    if(key==='length') return records[i*4+3];
                    if(!idx(key)) return Reflect.get(target,key);
                } else if(typeof key!=='string') return undefined;
                const j=array?child(i,Number(key)):lookup(i,key);
                return j===-1 ? undefined : view(j);
            },
            has(target,key){return array && idx(key) ? Number(key)<records[i*4+3] : Reflect.has(target,key);}
        });
    }
    return {used,records,lookup,next,material,view,scalar};
}
