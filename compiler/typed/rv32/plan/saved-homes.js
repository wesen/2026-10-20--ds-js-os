// Callee-saved homes, per register class.
import {A0, FA0, F, X, REGISTER_CLASSES, calleeRegisters, typeClass} from "../encoding/registers.js";

// The register class of a planner key: a parameter or frame local by its type (fn.params, and fn.localTypes for
// the frame locals when the front end gives them; a local without a type is an integer), every other key
// (capacities -1 - b, constants "c<n>", pointer homes "p...") by the integer class.
export function keyClass(fn, id) {
    if (typeof id !== "number" || id < 0) return X;
    const params = fn.params.length;
    return typeClass(id < params ? fn.params[id] : fn.localTypes?.[id - params]);
}

// Homes for every framed function. A leaf first keeps parameter i >= 1 in its incoming
// register a_i and uses the spare argument registers, which cost nothing; a0 is the
// emitter's scratch (capacity loads, division checks, results) and a7 holds a cached
// capacity. Any function may then claim s1..s11 for a local whose estimated accesses per
// call exceed twice the two instructions of save and restore. The factor of two absorbs
// the static estimate's optimism about branches; on the opening ray frame it gave the
// fewest instructions of the factors 1-4 (diary, PICOCALC-RAY-PARITY Step 4). Scores fall
// in sorted order and costs rise along the free list, so the first unaffordable local
// ends the assignment of its class.
// Each class has its own registers (encoding/registers.js REGISTER_CLASSES): an f32 local takes fa_i, a spare
// fa register or fs0..fs11 (ilp32f), by the same rules; fa0 stays free like a0.
const SAVED_MARGIN = 2;
export function planSavedHomes(fn, scores, homes, leaf, capacityCached, intervals, reuseArgs) {
    // A class without a key takes no part: an integer-only function plans exactly as before register classes.
    const floats = fn.params.includes("f32") || Boolean(fn.localTypes?.includes("f32"));
    const free = [], opened = [], closed = [false, !floats];
    // share: a register already holding homes takes another local whose live interval
    // overlaps none of theirs, at no further cost. Keys without an interval (capacities,
    // constants, slots live everywhere) occupy their register for the whole function.
    const span = id => intervals?.get(id) ?? [-Infinity, Infinity];
    const disjoint = (r, [s, e]) => r.spans.every(([s2, e2]) => e < s2 || s > e2);
    if (leaf) {
        const incoming = calleeRegisters(fn);
        // An incoming register the leaf may keep: not the first of its class, not a7 while it caches a capacity.
        const keeps = reg => reg !== A0 && reg !== FA0 && !(capacityCached && reg === A0 + 7);
        for (let p = 1; p < fn.params.length; p++) if (keeps(incoming[p]) && (scores.get(p) ?? 0) >= 2) {
            homes.set(p, incoming[p]);
            opened.push({reg: incoming[p], cls: keyClass(fn, p), spans: [span(p)]});
        }
        for (const {id, arguments: args} of REGISTER_CLASSES) {
            if (closed[id]) continue;
            const used = incoming.filter(reg => reg >> 5 === id).length;
            for (let k = Math.max(1, used); k < (capacityCached && id === X ? 7 : 8); k++) free.push({reg: args[k], cls: id, cost: 0});
        }
        // reuseArgs: the argument register of a parameter without its own home there is free once
        // the prologue has written the parameter to its slot or home. Only a plain local, first
        // written in the body, may take it: parameter, capacity and pointer homes are filled in
        // the prologue, from the incoming registers (RAY-PARITY Step 21).
        if (reuseArgs) for (let p = 1; p < fn.params.length; p++)
            if (!homes.has(p) && keeps(incoming[p])) free.push({reg: incoming[p], cls: keyClass(fn, p), cost: 0, localsOnly: true});
    }
    for (const {id, homes: saved} of REGISTER_CLASSES) if (!closed[id]) for (const reg of saved) free.push({reg, cls: id, cost: 2});
    for (const [id, score] of [...scores].sort((a, b) => b[1] - a[1])) {
        if (homes.has(id)) continue;
        const cls = keyClass(fn, id);
        if (closed[cls]) continue;
        const own = span(id);
        const plain = typeof id === "number" && id >= fn.params.length;
        const shared = intervals && score >= 1 ? opened.find(r => r.cls === cls && (plain || !r.localsOnly) && disjoint(r, own)) : undefined;
        if (shared) {
            homes.set(id, shared.reg);
            shared.spans.push(own);
            continue;
        }
        const at = free.findIndex(f => f.cls === cls && (plain || !f.localsOnly));
        if (at < 0 || score <= (free[at].cost ? SAVED_MARGIN * free[at].cost : 1)) {
            if (intervals) continue;
            closed[cls] = true;
            if (closed[X] && closed[F]) break;
            continue;
        }
        const [{reg, localsOnly}] = free.splice(at, 1);
        homes.set(id, reg);
        opened.push({reg, cls, spans: [own], localsOnly});
    }
}
