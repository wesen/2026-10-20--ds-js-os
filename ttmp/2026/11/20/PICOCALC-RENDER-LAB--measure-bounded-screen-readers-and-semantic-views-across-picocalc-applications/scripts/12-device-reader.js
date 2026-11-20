// Same scalar conversion on both scanner treatments; count key strings as well.
function weight(v) {return typeof v==='string'?v.length+1:typeof v==='number'?v|0:v===true?3:v===false?2:1;}
function treeWeight(value) {
    if(value===null || typeof value!=='object')return weight(value);
    let n=0;
    if(Array.isArray(value)){for(const v of value)n+=treeWeight(v);}
    else for(const k of Object.keys(value))n+=weight(k)+treeWeight(value[k]);
    return n;
}
function renderLabRun(arm,reps) {
    const pair=arm.split('-'), text=labFrames[pair[0]], variant=pair[1];
    if(!text || !['native','index','both','sparse','key'].includes(variant))throw Error('arm');
    const records=new Uint16Array(4096*4);
    let build=0,access=0,sum=0,tokens=0;
    for(let n=0;n<reps;n++){
        const a=labMicros();
        const obj=(variant==='native'||variant==='key')?JSON.parse(text):indexScreen(text,records);
        const b=labMicros();
        if(variant==='native') sum+=treeWeight(obj);
        if(variant==='key') sum+=weight(obj.t);
        if(variant==='index'){
            tokens=obj.used;
            for(let i=0;i<obj.used;i++){
                const ch=text[records[i*4]];
                if(ch!=='{' && ch!=='[')sum+=weight(obj.scalar(i));
            }
        }
        if(variant==='both'){tokens=obj.used;sum+=treeWeight(obj.material());}
        if(variant==='sparse'){tokens=obj.used;sum+=weight(obj.scalar(obj.lookup(0,'t')));}
        build+=b-a; access+=labMicros()-b;
    }
    return JSON.stringify({bytes:utf8Size(text),tokens,buildUs:build,accessUs:access,sum,reps});
}
