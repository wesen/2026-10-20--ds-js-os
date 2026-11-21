// Run this cell while the merged baseline and candidate corpus is mounted.
(() => {
    const arms = ['pie','empty','full']
    const plans = simd.decisions()
    const traces = simd.traces()
    const metrics = arms.map(arm => {
        const t = traces.find(t => t.id === arm+'-opening')
        const d = plans.find(d => d.id === arm+'-row')
        if (!d || !t) throw Error('incomplete arm: '+arm)
        const count = role => simd.executions(d.id,t.id,role).executions
        return {arm,steps:t.steps,rawImageBytes:t.imageBytes,imageSHA:t.imageSHA,
            packetStores:count('full-packet-scratch-store'), laneLoads:count('scalar-lane-load'),
            extracts: d.ranges.some(r=>r.role==='extract-full-hit-lane') ? count('extract-full-hit-lane') : null }
    })
    const packets = simd.packets('opening-160-rows').packets
    const empty = packets.filter(p=>p.hitMask===0).length
    const full = packets.filter(p=>p.hitMask===255).length
    const [baseline,skip,extract] = metrics
    const predicted = [8*empty,8*full]
    const observed = [baseline.laneLoads-skip.laneLoads,skip.laneLoads-extract.laneLoads]
    if (predicted.some((n,i)=>n!==observed[i]) || extract.extracts!==8*full)
        throw Error('observed lane operations contradict scalar mask prediction')
    return {workload:'opening-160-rows',unit:'executed guest instructions',
        predicted,observed,metrics,
        stepChangePctFromBaseline:metrics.map(r=>100*(r.steps-baseline.steps)/baseline.steps)}
})()
