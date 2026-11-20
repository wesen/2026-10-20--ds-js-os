// The build script supplies corpus, frozen splits, engine label and a clock.
function renderLabRun() {
    const arms = ['generic', 'fixed', 'adaptive-cold', 'adaptive-prefix'];
    const standard = observedPSIX.bounds;
    const read = row => row.payload;
    const sum = values => values.reduce((total, value) => total + value, 0);
    const statsFor = values => {
        const sorted = values.slice().sort((a, b) => a - b);
        return {min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1), samples: values};
    };
    const same = (actual, expected) => actual.length === expected.length &&
        actual.every((byte, index) => byte === expected[index]);
    const one = (id, tree, title = 'Probe') => ({id, payload: {app: 'test', title, frame: {tree, hints: ''}}});
    const probe = i => one('cycle-' + i, {t: 'col', kids: [{t: 'text', s: String(i)}],
        values: Array.from({length: i}, (_, j) => j * 0.125)});
    const cycle = Array.from({length: 12}, (_, i) => probe(i));
    const stress = Array.from({length: 6}, () => cycle).flat();
    const repeated = i => one('repeat-' + i, {t: 'col', kids: [{t: 'text', s: 'reading ' + i}],
        values: Array.from({length: 48}, (_, j) => (j + i) * 0.125 + 0.03125)});
    const stable = Array.from({length: 40}, (_, i) => repeated(i));
    const alternate = key => one('switch-' + key, {[key]: 1, kids: [{t: 'text', s: 'row'}]});
    function changedFields() {
        const a = one('train', {t: 'text', word: 'word', v: [1, 2.5, false, null, 'z'], '界': '🙂'});
        const changed = one('current-scalars', {t: '', word: 'a', v: [-524288, 8.25, true, null, 'word'], '界': '𝄞'}, 'é');
        const swapped = one('reordered-keys', {'界': '🙂', v: [1, 2.5, false, null, 'z'], word: 'word', t: 'text'});
        const promoted = one('float-boundary', {...a.payload.frame.tree, v: [524288, 2.5, false, null, 'z']});
        const newValue = one('optional-value', {...a.payload.frame.tree, v: [1, 2.5, false, 'now present', 'z']});
        const keys = JSON.parse('{"__proto__":1,"constructor":2,"𐀀":"a","\uE000":"b","01":3,"10":5,"2":6}');
        const unicode = one('key-utf8-order', keys);
        return {train: [a, unicode], rows: [changed, swapped, promoted, newValue, unicode]};
    }

    function interleave(groups) {
        const rows = [];
        for (let i = 0; i < Math.max(...groups.map(group => group.length)); i++) {
            for (const group of groups) if (i < group.length) rows.push(group[i]);
        }
        return rows;
    }

    function split(app) {
        const {rows, cut} = runtimeCorpus[app];
        return {train: rows.slice(0, cut), rows: rows.slice(cut)};
    }
    const apps = ['sysmon', 'chess', 'snake', 'editor'];
    const partitions = apps.map(split);
    const tests = [
        ...partitions.map((test, i) => ({name: apps[i] + '-holdout', ...test})),
        {name: 'system-complete-replay', train: [], rows: runtimeCorpus.sysmon.rows},
        {name: 'all-application-holdouts', train: interleave(partitions.map(test => test.train)),
            rows: interleave(partitions.map(test => test.rows))},
        {name: 'independent-keys', train: partitions[0].train, rows: runtimeCorpus.keys.rows},
        {name: 'fixed-shape-control', train: [repeated(100)], rows: stable},
        {name: 'shape-churn-control', train: cycle, rows: stress},
    ];

    function setup(arm, prefix, bank, config, clock) {
        if (arm === 'generic') return {write: binaryScreen.encode, state: () => ({})};
        if (arm === 'fixed') return observedPSIX.create('fixed', config, bank, clock);
        const encoder = observedPSIX.create('adaptive', config, [], clock);
        if (arm === 'adaptive-prefix') for (const row of prefix) encoder.write(row.payload);
        return encoder;
    }

    function since(first, last) {
        return Object.fromEntries(Object.entries(last).map(([key, end]) =>
            [key, key.startsWith('peak') || key.startsWith('resident') ? end : end - first[key]]));
    }

    function validate(test, config) {
        const bank = observedPSIX.train(test.train.map(read), config);
        const originals = test.rows.map(row => binaryScreen.encode(row.payload));
        let wireHash = 2166136261;
        for (const wire of originals) {
            for (const byte of wire) wireHash = Math.imul(wireHash ^ byte, 16777619) >>> 0;
        }
        const counts = {};
        for (const arm of arms.slice(1)) {
            const encoder = setup(arm, test.train, bank.plans, config);
            const initial = encoder.state();
            for (let i = 0; i < test.rows.length; i++) {
                const {id, payload} = test.rows[i];
                if (!same(encoder.write(payload), originals[i])) throw Error('wire mismatch ' + arm + ' ' + id);
            }
            counts[arm] = since(initial, encoder.state());
        }
        return {counts, frames: test.rows.length, bytes: sum(originals.map(wire => wire.length)),
            wireFNV32: wireHash.toString(16).padStart(8, '0')};
    }

    // Full call windows include candidate counters, caches, guards, writer,
    // fallback, and runtime plan construction. Fixture construction and
    // optional pretraining happen outside the window.
    function benchmark(test, config = standard) {
        const {train, rows} = test;
        const trainingStart = labMicros();
        const bank = observedPSIX.train(train.map(read), config);
        const trainingUs = labMicros() - trainingStart;
        const trials = Object.fromEntries(arms.map(arm => [arm, []]));
        const profiles = {};
        const validation = validate(test, config);
        let checksum = 0;

        for (let block = -1; block < 7; block++) {
            for (let position = 0; position < arms.length; position++) {
                const arm = arms[(position + block + arms.length) % arms.length];
                const startSetup = labMicros();
                const encoder = setup(arm, train, bank.plans, config);
                const endSetup = labMicros();
                const start = labMicros();
                for (const row of rows) {
                    const output = encoder.write(row.payload);
                    checksum = (checksum + output[output.length - 1] + output.length) >>> 0;
                }
                const end = labMicros();
                if (block >= 0) trials[arm].push({streamUs: end - start, setupUs: endSetup - startSetup});
            }
        }
        for (const arm of arms.slice(1)) {
            const encoder = setup(arm, train, bank.plans, config, labMicros);
            const first = encoder.state();
            const matched = {hits: [], misses: []};
            for (const row of rows) {
                const before = encoder.state();
                const start = labMicros();
                encoder.write(row.payload);
                const outputUs = labMicros() - start;
                const after = encoder.state();
                const hit = before.hits !== after.hits;
                const genericStart = labMicros();
                const output = binaryScreen.encode(row.payload);
                const genericUs = labMicros() - genericStart;
                checksum ^= output.length;
                matched[hit ? 'hits' : 'misses'].push({id: row.id, outputUs, genericUs});
            }
            const stream = since(first, encoder.state());
            const matchedSummary = Object.fromEntries(Object.entries(matched).map(([key, list]) =>
                [key, {n: list.length, genericUs: sum(list.map(row => row.genericUs)),
                    observedUs: sum(list.map(row => row.outputUs))}]));
            profiles[arm] = {stream, matched: matchedSummary};
        }
        return {frames: rows.length, trainingFrames: train.length, trainingUs, shapesTrained: bank.shapes,
            fixedPlans: bank.frequency, validation, profiles, checksum,
            trials: Object.fromEntries(arms.map(arm => [arm, {
                streamUs: statsFor(trials[arm].map(trial => trial.streamUs)),
                setupUs: statsFor(trials[arm].map(trial => trial.setupUs)),
            }]))};
    }

    function checkFailures() {
        const test = changedFields();
        const variants = validate(test, standard);
        const a = alternate('a');
        const config = {...standard, bytes: 200, planBytes: 200};
        const decline = validate({train: [], rows: [a, alternate('b'), a]}, config);
        const bad = val => one('bad', {t: 'text', word: 'word', v: [1, 2.5, false, null, val], '界': '🙂'});
        const training = test.train.map(read);
        const {plans} = observedPSIX.train(training, standard);
        const invalid = [
            [bad('\ud800'), 'utf8'],
            [bad('é'.repeat(1025)), 'string-cap'],
            [bad(Infinity), 'number'],
            [one('large', Array.from({length: 1025}, () => 0)), 'array-cap'],
            [one('wide-object', Object.fromEntries(Array.from({length: 65}, (_, i) => ['key' + i, i]))), 'field-cap'],
            [one('wide-wire', Array.from({length: 48}, (_, i) => String(i).padEnd(1000, '-'))), 'byte-cap'],
        ];
        const errors = {};
        for (const [row, expected] of invalid) {
            errors[row.id + '-' + expected] = {};
            for (const arm of arms) {
                const encoder = setup(arm, test.train, plans, standard);
                let result;
                try { encoder.write(row.payload); }
                catch (error) { result = error.message; }
                if (result !== expected) throw Error('expected ' + expected + ' from ' + arm + ', got ' + result);
                errors[row.id + '-' + expected][arm] = encoder.state();
            }
        }
        return {variants, decline, errors};
    }

    if (runtimeMode.startsWith('resident')) {
        const {rows} = runtimeCorpus.sysmon;
        const encoder = setup(runtimeMode === 'resident-generic' ? 'generic' : 'adaptive-cold', [], [], standard);
        for (const row of rows) encoder.write(row.payload);
        if (runtimeMode !== 'resident-released') globalThis.retainObservedEncoder = encoder;
        return JSON.stringify({config: standard, frames: rows.length, state: encoder.state(), environment: runtimeEnvironment});
    }
    const complete = validate({train: [], rows: apps.flatMap(app => runtimeCorpus[app].rows)}, standard);
    const failures = checkFailures();
    const results = {};
    for (const test of tests) results[test.name] = benchmark(test);
    const sensitivity = {};
    for (const entries of [1, 2, 4, 8, 16]) {
        const config = {...standard, entries};
        sensitivity[entries] = Object.fromEntries(tests.filter(test =>
            ['sysmon-holdout', 'all-application-holdouts', 'shape-churn-control'].includes(test.name)).map(test =>
            [test.name, validate(test, config)]));
    }
    return JSON.stringify({engine: runtimeEngine, environment: runtimeEnvironment, limits: standard, splits: runtimeManifest,
        complete, failures, results, sensitivity});
}
