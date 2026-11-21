// Reusable cells for the merged SIMD service. Raw physical trials are bound by
// 09-open-lab-session.py. Each lookup holds its workload, units and controls fixed.
const median = xs => {
    if (!xs.length) throw Error("no observations");
    const a=xs.slice().sort((x,y)=>x-y), i=Math.floor(a.length/2);
    return a.length%2?a[i]:(a[i-1]+a[i])/2;
};
const paired = (rows, a, b, key, value) => {
    const series = arm => {
        const list=rows.filter(r=>key(r)===arm), m=new Map(list.map(r=>[r.block,value(r)]));
        if(m.size!==list.length) throw Error("duplicate treatment block");
        return m;
    };
    const x=series(a), y=series(b);
    if(!x.size || x.size!==y.size || [...x.keys()].some(i=>!y.has(i)))throw Error("unmatched conditions");
    const d=[...x].map(([i,v])=>100*(v-y.get(i))/v);
    return {blocks:x.size,baselineMedian:median([...x.values()]), candidateMedian:median([...y.values()]),
            pairedMedianSavedPct:median(d),winningBlocks:d.filter(n=>n>0).length};
};
lab.frame = (pose,phase,a,b) => {
    const ix=["clean","primary"].indexOf(phase);
    const result=paired(lab.frames.filter(r=>r.fixture===pose && r.phase===ix),a,b,
                        r=>["baseline","empty","full"][r.arm],r=>r.us);
    return {unit:"microseconds per compiled call", ...result};
};
lab.physicsPair = (kernel,n,a,b) => paired(lab.physics.filter(r=>r.kind===kernel && r.n===n),a,b,r=>r.name,r=>r.cycles/r.repeats);
lab.collisionCosts = (fixture,reach) => ["stock","scalar","pie"].map((arm,i)=>({arm,cycles:median(
    lab.collision.filter(r=>r.fixture===fixture && r.reach===reach && r.arm===i).map(r=>r.cycles/r.calls))}));
lab.gateCosts = n => ["stock","pie","gated"].map((arm,i)=>({arm,cycles:median(
    lab.lengthGate.filter(r=>r.n===n && r.arm===i).map(r=>r.cycles/r.calls))}));
lab.packetPrediction = () => {
    const masks=simd.packets("opening-160-rows").packets;
    const reads=arm=>simd.executions(arm+"-row",arm+"-opening","scalar-lane-load").executions;
    return {packets:masks.length, predicted:8*masks.filter(r=>r.hitMask===0).length,
            observed:reads("pie")-reads("empty")};
};

// Link each blind prediction to actual physical costs by source family and fixture.
lab.selection = (family,n,reach) => {
    const trial = lab.scores.cases.find(x=>x.family===family && x.n===n && x.reach===reach);
    if (!trial) throw Error("no measured input with that family, length and reach");
    const build=lab.images.compiled[family].auto;
    const decision=build.calls[0];
    if (decision.plan!==trial.predicted || build.sha!==lab.images.compiled[family][decision.plan].sha)
        throw Error("selected and forced compiler images differ");
    return {family, n, reach, decision, imageSHA256:build.sha, codeBytes:build.len,
            unit:"physical P4 cycles per call", measured:trial.medianCycles, regretPct:trial.regretPct};
};

lab.packetCosts = (scene,kind) => {
    const cell = lab.packetClasses[scene]?.[kind];
    if (!cell) throw Error("unknown packet scene or class");
    return {unit:"P4 cycles per eight-lane packet in hand microbenchmark",
            scene,kind,packetsPerBlock:cell.packets_per_block,schedules:cell.schedules};
};
undefined
