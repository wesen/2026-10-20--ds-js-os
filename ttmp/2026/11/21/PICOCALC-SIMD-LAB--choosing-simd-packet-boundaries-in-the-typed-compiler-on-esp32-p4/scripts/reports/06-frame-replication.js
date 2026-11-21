(() => {
    const clean = lab.frames.filter(r=>r.phase===0);
    const pairs = clean.filter(r=>r.arm===0).map(base=>{
        const candidates = clean.filter(r=>r.fixture===base.fixture && r.block===base.block && r.arm===1);
        if (candidates.length!==1) throw Error("missing or duplicate candidate");
        return {fixture:base.fixture, block:base.block, savedUs:base.us-candidates[0].us};
    });
    return {pairs:pairs.length, wins:pairs.filter(p=>p.savedUs>0).length,
        opening:pairs.filter(p=>p.fixture==="default").map(p=>p.savedUs)};
})()
