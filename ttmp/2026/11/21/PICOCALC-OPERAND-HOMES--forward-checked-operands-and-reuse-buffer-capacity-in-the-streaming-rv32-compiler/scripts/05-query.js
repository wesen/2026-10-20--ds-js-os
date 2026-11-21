// The loader binds rows to the checked, normalized physical trial data.
const median = xs => {const s=xs.slice().sort((a,b)=>a-b); return (s[(s.length-1)>>1]+s[s.length>>1])/2;};
const names=["control","forward","capacity","both","homes"];
function compare(kind,fixture,phase,arm){
    const offset=kind==="pred"?3:kind==="frame"?1:0;
    function blocks(i){
        const s=rows.filter(r=>r.kind===kind && r.fixture===fixture && r.phase===phase && r.arm===i+offset);
        if(s.length!==6 || new Set(s.map(r=>r.block)).size!==6)throw Error("unmatched blocks");
        return s.sort((a,b)=>a.block-b.block).map(r=>r.value);
    }
    const a=blocks(0),b=blocks(names.indexOf(arm));
    return {control:median(a),candidate:median(b),savedPct:median(a.map((x,i)=>100*(1-b[i]/x))),wins:a.filter((x,i)=>x>b[i]).length};
}
const scores=Object.fromEntries(names.map(a=>[a,Object.fromEntries([
    ["predicate","pred","default",-1],["frame","frame","default",0],["primary","frame","default",1],
    ["compile","compileUs","0",0],["peak","peakBytes","0",0]
].map(([key,k,f,p])=>[key,compare(k,f,p,a)]))]));
const sceneEffects=[...new Set(rows.filter(r=>r.kind==="frame").map(r=>r.fixture))].map(f=>({name:f,...compare("frame",f,0,"homes")}));
const reference = (kind,fixture,phase,arm) => median(rows.filter(r=>r.kind===kind && r.fixture===fixture && r.phase===phase && r.arm===arm).map(r=>r.value));
const references = {
    scalarCFrameUs: reference("frame","default",0,0),
    checkedCPredicateCycles: reference("pred","default",-1,2)
};
