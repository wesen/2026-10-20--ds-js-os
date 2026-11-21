// Used only by inspector-equipped compiler builds. Preserves original IR
// coordinates, and discloses the two synthetic insertion sites in the skip arm.
function factorInspection(guard,fast,fallback,fastAt,fallbackAt,originalIR) {
    if (!fast.inspection || !fallback.inspection) return;
    guard.program.nativeInspection.leafDecision = 'qualified scalar row with checked fallback';
    const fastRanges=fast.inspection.ranges.map(r=>{
        const start=r.inputStart, end=r.inputEnd;
        const synthetic=factorFlags.skip && ((start>=166 && start<173) || start===311);
        if(synthetic) {
            const point=start===311?304:166;
            return {...r,inputStart:point,inputEnd:point,role:'synthetic skip',
                decisions:[...r.decisions,'inserted empty-sphere-row control']};
        }
        const offset=!factorFlags.skip || start<166?0:(start<311?7:8);
        const op=originalIR[start-offset], decisions=[...r.decisions];
        if(op===0xf1) decisions.push(factorFlags.hoist?'per-access check discharged by row preflight':'checked UTF-16 element address');
        if(factorFlags.registers && op===0x20 && rowHomes.has(originalIR[start-offset+1]))
            decisions.push(r.start===r.end?'consume local directly from register':'read from register home');
        return {...r,inputStart:start-offset,inputEnd:end-offset,decisions};
    });
    guard.inspectionSegments=[{offset:4*fastAt,label:'fast',ranges:fastRanges},
                              {offset:4*fallbackAt,label:'fallback',ranges:fallback.inspection.ranges}];
}
