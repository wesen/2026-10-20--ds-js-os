// Policy decisions use only inexpensive function metadata. Actual proof results are evaluator-only.
export const functionCap = 2048;
export const metadataCap = 256;
const slotCap = 128;
const localWeight = 1;

function guardWords(op, value) {
    if (value === undefined || value === 0) return 0;
    return op === 0x6d && value !== -1 ? 9 : 2;
}

export function metadata(fn, Cursor, policy) {
    const cells = fn.code.length;
    const candidate = fn.hasDivision && cells <= functionCap;
    const row = {name: fn.name, charge: 2 * cells, candidate, literal: 0, local: 0, visits: 0};
    if (!candidate) return row;

    const ranked = policy === 'density';
    const states = ranked ? new Uint8Array(slotCap) : null;
    const values = ranked ? new Int32Array(slotCap) : null;
    const contributions = ranked ? new Uint16Array(slotCap) : null;
    const firstLocal = fn.params.length;
    let depth = 0;
    const cursor = new Cursor(fn.code);
    while (cursor.advance()) {
        const op = fn.code[cursor.at];
        if (op === 0x6d || op === 0x6f) {
            row.literal += guardWords(op, cursor.precedingConstant());
            if (ranked && fn.code[cursor.previous] === 0x20) {
                const slot = fn.code[cursor.previous + 1];
                if (states[slot] === 1) contributions[slot] += guardWords(op, values[slot]);
            }
        } else if (ranked) {
            if (op === 0x02 || op === 0x03 || op === 0x04) depth++;
            else if (op === 0x0b) depth--;
            else if (op === 0x21) {
                const slot = fn.code[cursor.at + 1];
                if (slot < firstLocal || slot >= slotCap) continue;
                const value = cursor.precedingConstant();
                if (states[slot] === 0 && depth === 0 && value !== undefined) {
                    states[slot] = 1;
                    values[slot] = value;
                } else {
                    states[slot] = 2;
                }
            }
        }
    }
    if (cursor.failed) throw Error('unexpected numeric opcode layout');
    if (ranked) {
        for (let slot = firstLocal; slot < slotCap; slot++)
            if (states[slot] === 1) row.local += contributions[slot];
    }
    row.visits = cells;
    return row;
}

export function choose(rows, policy, budget, weight = localWeight) {
    const fallback = policy !== 'source' && rows.length > metadataCap;
    const selectedPolicy = fallback ? 'source' : policy;
    let compares = 0;
    let candidates = rows.filter(r => r.candidate);
    if (selectedPolicy !== 'source') {
        const score = r => r.literal + (selectedPolicy === 'density' ? weight * r.local : 0);
        candidates = candidates.filter(r => score(r) > 0);
        candidates.sort((a, b) => {
            compares++;
            const difference = selectedPolicy === 'density'
                ? score(b) * a.charge - score(a) * b.charge : 0;
            return difference || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        });
    }
    const names = new Set();
    let charge = 0;
    for (const row of candidates) {
        if (charge + row.charge <= budget) {
            names.add(row.name);
            charge += row.charge;
        }
    }
    return {names, charge, compares, fallback};
}
