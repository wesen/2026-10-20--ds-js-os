// Callee-saved homes.
import {A0} from "../encoding/registers.js";

// Callee-saved registers a function may claim as homes. Each claimed register costs a
// save in the prologue and a restore in the epilogue, but survives calls. s0 stays free.
const SAVED_REGISTERS = [9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]; // s1, s2..s11
export const isSavedRegister = reg => reg === 9 || (reg >= 18 && reg <= 27);

// Homes for every framed function. A leaf first keeps parameter i >= 1 in its incoming
// register a_i and uses the spare argument registers, which cost nothing; a0 is the
// emitter's scratch (capacity loads, division checks, results) and a7 holds a cached
// capacity. Any function may then claim s1..s11 for a local whose estimated accesses per
// call exceed twice the two instructions of save and restore. The factor of two absorbs
// the static estimate's optimism about branches; on the opening ray frame it gave the
// fewest instructions of the factors 1-4 (diary, PICOCALC-RAY-PARITY Step 4). Scores fall
// in sorted order and costs rise along the free list, so the first unaffordable local
// ends the assignment.
const SAVED_MARGIN = 2;
export function planSavedHomes(fn, scores, homes, leaf, capacityCached, intervals, reuseArgs) {
    const free = [], opened = [];
    // share: a register already holding homes takes another local whose live interval
    // overlaps none of theirs, at no further cost. Keys without an interval (capacities,
    // constants, slots live everywhere) occupy their register for the whole function.
    const span = id => intervals?.get(id) ?? [-Infinity, Infinity];
    const disjoint = (r, [s, e]) => r.spans.every(([s2, e2]) => e < s2 || s > e2);
    if (leaf) {
        const lastIncoming = capacityCached ? Math.min(fn.params.length, 7) : fn.params.length;
        for (let p = 1; p < lastIncoming; p++) if ((scores.get(p) ?? 0) >= 2) {
            homes.set(p, A0 + p);
            opened.push({reg: A0 + p, spans: [span(p)]});
        }
        for (let reg = A0 + Math.max(1, fn.params.length); reg < A0 + (capacityCached ? 7 : 8); reg++)
            free.push({reg, cost: 0});
        // reuseArgs: the argument register of a parameter without its own home there is free once
        // the prologue has written the parameter to its slot or home. Only a plain local, first
        // written in the body, may take it: parameter, capacity and pointer homes are filled in
        // the prologue, from the incoming registers (RAY-PARITY Step 21).
        if (reuseArgs) for (let p = 1; p < lastIncoming; p++) if (!homes.has(p)) free.push({reg: A0 + p, cost: 0, localsOnly: true});
    }
    for (const reg of SAVED_REGISTERS) free.push({reg, cost: 2});
    for (const [id, score] of [...scores].sort((a, b) => b[1] - a[1])) {
        if (homes.has(id)) continue;
        const own = span(id);
        const plain = typeof id === "number" && id >= fn.params.length;
        const shared = intervals && score >= 1 ? opened.find(r => (plain || !r.localsOnly) && disjoint(r, own)) : undefined;
        if (shared) {
            homes.set(id, shared.reg);
            shared.spans.push(own);
            continue;
        }
        const at = free.findIndex(f => plain || !f.localsOnly);
        if (at < 0 || score <= (free[at].cost ? SAVED_MARGIN * free[at].cost : 1)) {
            if (intervals) continue;
            break;
        }
        const [{reg, localsOnly}] = free.splice(at, 1);
        homes.set(id, reg);
        opened.push({reg, spans: [own], localsOnly});
    }
}

