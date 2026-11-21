["pie", "empty", "full"].map(plan => {
    const row = simd.executions(plan+"-row", plan+"-opening", "scalar-lane-load");
    return {plan, imageSHA:row.imageSHA, executedLoads:row.executions};
})
