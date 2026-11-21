// Run this as one cell against --simd-study various/evidence/ray.json.
// sources, pc histograms and packets remain individually accessible in this room.
(() => {
    const plans=simd.decisions();
    const traces=simd.traces().map(t=>({id:t.id,workload:t.workload,steps:t.steps,imageSHA:t.imageSHA}));
    const role=(arm,kind)=>simd.executions(arm+'-row',arm+'-opening',kind).executions;
    const groups = simd.packets('opening-160-rows').packets;
    const mix = groups.reduce((s,g)=>{
        if(g.lanes!==8)throw Error('this workbook scopes its census to full packets');
        if(g.hitMask===0)s.empty++;
        else if(g.hitMask===255)s.full++;
        else s.mixed++;
        return s;
    },{empty:0,mixed:0,full:0});
    const arms=['scalar','pie'].map(arm=>({
        arm, packetScratchStores:role(arm,'full-packet-scratch-store'),
        prefixStores:role(arm,'single-prefix-scratch-store'),
        scalarLaneLoads:role(arm,'scalar-lane-load'),
        hitContinuation:role(arm,'scalar hit continuation'),
        packetControl:role(arm,'admission and packet control'),
        producerAndSign:role(arm,'halfword producer and sign guard')
    }));
    let blocked=null;
    try {simd.executions('pie-row','scalar-opening','scalar-lane-load');}
    catch(e){blocked=String(e);}
    if(!blocked)throw Error('different machine images were joined');
    const boardIdentity = hardware.help().available ? Object.entries(hardware.metadata().images).map(([arm,board])=>{
        const guest=traces.find(t=>t.id===arm+'-opening');
        if(!guest || guest.imageSHA!==board.imageSHA)throw Error('board and interpreted image differ for '+arm);
        return {arm,imageSHA:board.imageSHA,elfCRC:board.elfCRC};
    }) : null;
    const gap=traces.find(t=>t.id==='scalar-opening').steps-traces.find(t=>t.id==='pie-opening').steps;
    if(gap!==arms[0].producerAndSign-arms[1].producerAndSign+arms[0].packetControl-arms[1].packetControl)
        throw Error('observed producer/control deltas did not reconcile with total step delta');
    return {traces,boardIdentity,refusals:plans.filter(p=>p.alternatives.some(a=>a.status==='rejected')).map(p=>({id:p.id,source:p.source,reason:p.alternatives[0].reason})),
        groups:groups.length,mix,avoidedLaneVisitUpperBound:mix.empty*8,arms,gap,wrongImage:blocked};
})()
