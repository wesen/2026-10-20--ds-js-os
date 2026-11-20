const stageAdaptiveArms = ['generic', 'trained', 'online', 'warm'];
function stageSetup(arm) {
    const config = observedPSIX.bounds;
    if (arm === 'generic') return {write: binaryScreen.encode, state: () => ({})};
    if (arm === 'trained') {
        const bank = observedPSIX.train(fixtures.train.map(row => row.payload), config);
        return observedPSIX.create('fixed', config, bank.plans);
    }
    const encoder = observedPSIX.create('adaptive', config);
    if (arm === 'warm') for (const row of fixtures.train) encoder.write(row.payload);
    return encoder;
}
function stageReceipt(arm, rows, repetitions) {
    const setupStart = stageMicros();
    const encoder = stageSetup(arm);
    const setupUs = stageMicros() - setupStart;
    const before = encoder.state();
    let count = 0, bytes = 0, digest = 2166136261, elapsedUs = 0;
    for (let run = 0; run < repetitions; run++) {
        for (const row of rows) {
            const start = stageMicros();
            const wire = encoder.write(row.payload);
            elapsedUs += stageMicros() - start;
            count++;
            bytes += wire.length;
            for (const byte of wire) digest = Math.imul(digest ^ byte, 16777619) >>> 0;
        }
    }
    const after = encoder.state();
    const delta = {};
    for (const key of ['hits', 'fallback', 'compiled', 'evictions', 'guardAttempts']) {
        delta[key] = key in after ? after[key] - before[key] : 0;
    }
    return {elapsedUs, setupUs, count, bytes, wireHash: digest.toString(16).padStart(8, '0'),
        ...delta, residentChargedBytes: after.residentBytes || 0};
}
globalThis.stageAdaptiveRun = function(spec, repetitions = 1) {
    const [arm, app = 'system'] = spec.split('-');
    const rows = fixtures.tests[app];
    if (!rows || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw Error('bad stage request');
    if (arm === 'verify') {
        const expected = rows.map(row => binaryScreen.encode(row.payload));
        for (const candidate of stageAdaptiveArms.slice(1)) {
            const encoder = stageSetup(candidate);
            for (let i = 0; i < rows.length; i++) {
                const wire = encoder.write(rows[i].payload), oracle = expected[i];
                if (wire.length !== oracle.length || !wire.every((byte, j) => byte === oracle[j])) {
                    throw Error(candidate + ' ' + rows[i].id + ' differs from original PSIX');
                }
            }
        }
        return {...stageReceipt('generic', rows, 1), verified: stageAdaptiveArms.length - 1};
    }
    if (!stageAdaptiveArms.includes(arm)) throw Error('bad stage arm');
    return stageReceipt(arm, rows, repetitions);
};
