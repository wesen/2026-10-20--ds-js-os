// Run after 05-open-repl.py loads the four capture families in the session.
const median = xs => {
    if (!xs.length) throw Error("empty sample");
    const s = xs.slice().sort((a,b)=>a-b), mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid-1]+s[mid])/2;
};
function comparison(rows, from, to, value) {
    const key = arm => {
        const data = rows.filter(r=>r.arm===arm);
        const map = new Map(data.map(r=>[r.block,value(r)]));
        if (map.size!==data.length) throw Error("duplicate measurement in a block");
        return map;
    };
    const a=key(from), b=key(to);
    if (!a.size || a.size!==b.size || [...a.keys()].some(k=>!b.has(k))) throw Error("unmatched blocks");
    const d=[...a].map(([block,v])=>v-b.get(block));
    const percent=[...a].map(([block,v])=>100*(v-b.get(block))/v);
    return {control:median([...a.values()]),candidate:median([...b.values()]),saved:median(d),
            pct:median(percent), rangePct:[Math.min(...percent),Math.max(...percent)],
            wins:d.filter(x=>x>0).length, blocks:a.size};
}
const predNames = ["native-c","layout-c","checked-c","typed","shadow-only","general"];
const frameNames = ["native-c","typed","shadow-only","general"];
const phaseNames = ["full","primary","shade"];
const namesOfPath = ["natural","x-reject","y-reject","exact-miss","hit"];
const cyclesPerCall = r => r.cycles/r.n;
lab.pred = (pose,path,from,to) => comparison(lab.rows.filter(r=>r.kind==="pred" &&
    r.pose===pose && r.path===namesOfPath.indexOf(path)-1),predNames.indexOf(from),predNames.indexOf(to),cyclesPerCall);
lab.frame = (pose,phase,from,to) => comparison(lab.rows.filter(r=>r.kind==="frame" &&
    r.pose===pose && r.phase===phaseNames.indexOf(phase)),frameNames.indexOf(from),frameNames.indexOf(to),r=>r.us);
lab.chess = (position,advanced) => comparison(lab.rows.filter(r=>r.kind==="chess" &&
    r.position===position && r.advanced===advanced),0,2,cyclesPerCall);
lab.cold = (family,measure,from=0,to=2) => comparison(lab.rows.filter(r=>r.kind==="cold"&&r.family===family),from,to,r=>r[measure]);
lab.mix = pose => {
    const p=lab.paths.find(r=>r.fixture===pose);
    if (!p) throw Error("unknown pose");
    const counts={X:0,Y:0,M:0,H:0}, seq=Object.entries(p.patterns);
    for (const [word,n] of seq) for (const step of word) counts[step]+=n;
    return {calls:seq.reduce((sum,row)=>sum+row[1],0), visits:Object.values(counts).reduce((a,b)=>a+b),counts};
};
lab.score = () => ({
    openingPaths:lab.mix("default"),
    pred:Object.fromEntries(namesOfPath.map(path=>[path,
        Object.fromEntries(predNames.slice(1).map(arm=>[arm,lab.pred("default",path,"native-c",arm)]))])),
    shadow:Object.fromEntries(namesOfPath.map(path=>[path,lab.pred("default",path,"typed","shadow-only")])),
    frame:Object.fromEntries(lab.paths.map(p=>[p.fixture,Object.fromEntries(phaseNames.map(phase=>[phase,
        Object.fromEntries(["shadow-only","general","native-c"].map(a=>[a,lab.frame(p.fixture,phase,"typed",a)]))]))])),
    chess:[0,1,2].map(i=>[lab.chess(i,0),lab.chess(i,1)]),
    cold:[0,1].map(f=>Object.fromEntries(["compileUs","totalUs","peakBytes","bytes"].map(field=>[field,lab.cold(f,field)])))
});
