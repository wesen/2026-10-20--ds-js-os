// Deterministic source generator. The driver unlocks evaluation seeds after the policy freeze.
export const trainingSeeds = [1,2,3,4,5,6,7,8];
export const evaluationSeeds = Array.from({length: 20}, (_, i) => 501 + i);
export const families = ['concentrated', 'decoys', 'distributed'];

function rng(seed) {
    let state = seed >>> 0;
    return limit => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) % limit;
    };
}

export function generated(family, seed) {
    const random = rng(seed);
    const count = family === 'training' ? 40 + random(12) : 50 + random(8);
    const special = random(count);
    const functions = [];
    for (let i = 0; i < count; i++) {
        const name = 'f' + String(i).padStart(3, '0');
        const ordinaryLength = family === 'training' ? 19 + random(31) : 30 + random(33);
        const length = family === 'concentrated' && i === special ? 12 + random(8) : ordinaryLength;
        const local = family !== 'concentrated' && i % 5 === 0;
        const decoy = family === 'decoys' && i % 5 !== 0;
        const useful = family === 'training' ? random(length + 1)
            : family === 'concentrated' ? (i === special ? length : 0)
            : family === 'decoys' ? (decoy ? length : 3 + random(length - 2))
            : 1 + random(length);
        const body = ['let r = x;', 'let k = 7;'];
        if (decoy) body.push(i % 2 ? 'if (x < 0) { k = d; }' : 'k = d;');
        if (family === 'decoys' && i % 10 === 0) body.push('if (d === 0) { return x / 0; }');
        for (let j = 0; j < length; j++) {
            const op = family === 'decoys' && j % 3 === 0 ? '%' : '/';
            const negative = family === 'decoys' && i % 10 === 0 && j % 7 === 0;
            const factor = decoy ? 'k' : j >= useful ? 'd' : negative ? '-1'
                : local ? 'k' : String(2 + j % 29);
            body.push('r=r+x'+op+factor+';');
        }
        functions.push({name, body:'function '+name+'(x:i32,d:i32):i32 { '+body.join('')+' return r; }'});
    }
    return {name: family + '-' + seed, functions};
}

export function orders(functions, seed) {
    const names = functions.map(f => f.name);
    const rows = [names, names.slice().reverse()];
    for (let i = 0; i < 20; i++) {
        const random = rng((seed * 0x9e3779b1 + i + 1) >>> 0);
        const ordered = names.slice();
        for (let j = ordered.length - 1; j > 0; j--) {
            const k = random(j + 1);
            [ordered[j], ordered[k]] = [ordered[k], ordered[j]];
        }
        rows.push(ordered);
    }
    return rows;
}

export function source(functions, names = functions.map(f => f.name)) {
    const byName = new Map(functions.map(f => [f.name, f.body]));
    return names.map(name => byName.get(name)).join('\n') + '\n';
}
