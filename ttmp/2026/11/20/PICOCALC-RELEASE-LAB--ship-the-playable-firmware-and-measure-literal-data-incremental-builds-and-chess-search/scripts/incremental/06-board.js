function crcOf(bytes) { return crc(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function equal(a,b) {if (a.length!==b.length) return false;for(let i=0;i<a.length;i++) if(a[i]!==b[i])return false;return true;}
globalThis.runTrial=function(app,source,buffer,stockCompile,gold) {
    const elf=new Uint8Array(buffer), edits=incrementalEdits(app,source);
    function compile(arm,text,prior) {
        globalThis.activeFragments=arm==='clean'?null:fragmentSession(prior);
        try {
            const begin=micros();
            const bytes=(arm==='clean'?stockCompile:compileTypedWorldRv32)(text,elf);
            const us=micros()-begin;
            return {us,bytes,stats:activeFragments?.stats(),state:activeFragments?.commit()};
        } finally {globalThis.activeFragments=null;}
    }
    function verified(b,key) {
        const actual=crcOf(b.bytes);
        if(actual!==gold[key])throw Error(app+' '+key+': CRC differs '+actual+' '+gold[key]);
        return actual;
    }
    for(const [parent,key] of [['base','body'],['body','signature'],['signature','layout']]){
        const before=compile('cache',edits[parent],null);verified(before,parent);
        const clean=compile('clean',edits[key],null);verified(clean,key);
        for(let i=0;i<3;i++){
            const arms=i%2?['ram','clean']:['clean','ram'];
            for(const arm of arms){
                const b=compile(arm,edits[key],before.state); verified(b,key);
                if(!equal(b.bytes,clean.bytes))throw Error('complete ELF differs');
                emit(JSON.stringify({app,key,arm,i,us:b.us,crc:gold[key],...b.stats}));
            }
        }
        if(key==='body'){
            const rawClean=compile('clean',source,null); verified(rawClean,'base');
            emit(JSON.stringify({app,key:'base',arm:'empty-cache',us:before.us,...before.stats}));
            emit(JSON.stringify({app,key:'base',arm:'clean',us:rawClean.us}));
            const checkpointBegin=micros();
            let t=checkpointBegin;
            const owner=fragmentBuildIdentity+":"+app;
            const expected=JSON.stringify({owner,state:before.state});
            const encodeUs=micros()-t;
            const timings=checkpoint(expected);
            t=micros();
            const packet=JSON.parse(timings[0]);
            if(packet.owner!==owner)throw Error("foreign checkpoint identity");
            const recovered=packet.state;
            const parseUs=micros()-t;
            const child=compile('ram',edits.body,recovered);
            const checkpointToEditedElfUs=micros()-checkpointBegin;
            verified(child,'body');
            if(!equal(child.bytes,clean.bytes))throw Error('restored byte mismatch');
            emit(JSON.stringify({app,key:'restore',bytes:expected.length,encodeUs,writeUs:timings[1],
                readUs:timings[2],checkpointToEditedElfUs,decodeUs:parseUs,childUs:child.us,...child.stats,persisted:timings[3]}));
            let expectedError,actualError;
            try {compile('clean',edits.bad,null);} catch(e){expectedError=String(e);}
            try {compile('ram',edits.bad,before.state);} catch(e){actualError=String(e);}
            if(!expectedError || actualError!==expectedError)throw Error('diagnostic mismatch');
            emit(JSON.stringify({app,key:'bad',diagnostic:actualError}));
        }
    }
};
