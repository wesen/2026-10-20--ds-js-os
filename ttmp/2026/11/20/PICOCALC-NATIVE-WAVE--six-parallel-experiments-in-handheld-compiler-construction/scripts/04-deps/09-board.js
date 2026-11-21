// The preregistered board endpoint returns a complete linked ELF. Validation is outside the timer.
globalThis.runTrial=function(app,source,buffer,ignored,gold) {
    const elf=new Uint8Array(buffer),texts=incrementalEdits(app,source);
    const arms=['clean','global','precise'];
    function build(arm,text,prior) {
        const globals=arm==='clean'?stockGlobals:arm==='global'?globalCacheGlobals:candidateGlobals;
        [globalThis.typedWasm,globalThis.typedAsync,globalThis.typedRv32]=globals;
        const session=arm==='clean'?null:(arm==='global'?fragmentSession:dependencySession)(prior);
        globalThis.activeFragments=session;
        try {
            const start=micros();const bytes=globals[3](text,elf);const us=micros()-start;
            return {bytes,us,root:session?.commit(),stats:session?.stats()};
        } finally {globalThis.activeFragments=null;}
    }
    function verify(x,oracle,key){
        const sum=crc(x.buffer,x.byteOffset,x.byteLength);
        if(sum!==gold[key]||x.length!==oracle.length)throw Error('gold disagreement '+key);
        for(let i=0;i<x.length;i++)if(x[i]!==oracle[i])throw Error('edited ELF differs');
        return sum;
    }
    for(const [parent,key] of [['base','body'],['body','signature'],['signature','layout']]){
        const goldBytes=build('clean',texts[key]).bytes;
        const prior={};
        for(const arm of ['global','precise'])prior[arm]=build(arm,texts[parent],null).root;
        for(let block=0;block<5;block++)for(let i=0;i<3;i++){
            const arm=arms[(block+i)%3],result=build(arm,texts[key],prior[arm]);
            const checksum=verify(result.bytes,goldBytes,key);
            emit(JSON.stringify({app,key,arm,block,us:result.us,crc:checksum,...result.stats}));
        }
    }
};
