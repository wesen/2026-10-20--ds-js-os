// Callee-saved homes, per register class.
import {A0, FA0, F, X, REGISTER_CLASSES, calleeRegisters, inOwnRegister, typeClass} from "../encoding/registers.js";
import {CHECKED_ADDRESS, UNCHECKED_ADDRESS, LITERAL_STORES, I32_DIV_S, I32_REM_S, BLOCK, IF, ELSE, END, CALL, VOID, opNext, tapeRow} from "../encoding/tape.js";

// A function with an f32 parameter, local or result. Its leaves get more free registers than an integer function's
// (planSavedHomes); integer functions keep the plans their pinned images record.
export const floatingFunction = fn => fn.result === "f32" || fn.params.includes("f32") || Boolean(fn.localTypes);

// The deepest operand stack of a leaf's tape (a leaf's only calls are guarded returns, which take and give one
// value): f operand-stack registers from there on are never used, so they are free homes.
function deepestStack(code) {
    let height = 0, deepest = 0;
    const blocks = [];
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at], row = tapeRow(op);
        if (op >= BLOCK && op <= IF) {
            if (op === IF) height--;
            blocks.push({height, value: code[at + 1] !== VOID});
            continue;
        }
        if (op === ELSE) { height = blocks.at(-1).height; continue; }
        if (op === END) {
            const block = blocks.pop();
            if (block) height = block.height + Number(block.value);
            continue;
        }
        height += op === CALL ? 0 : row.push.length - row.pop.length;
        deepest = Math.max(deepest, height);
    }
    return deepest;
}

// An f32 leaf may keep its first integer parameter in a0 when nothing uses a0 as scratch: no buffer access (a
// capacity), no division check.
const A0_SCRATCH = new Set([CHECKED_ADDRESS, UNCHECKED_ADDRESS, LITERAL_STORES, I32_DIV_S, I32_REM_S]);
function a0Free(code) {
    for (let at = 0; at < code.length; at = opNext(code, at)) if (A0_SCRATCH.has(code[at])) return false;
    return true;
}

// The register class of a planner key: a parameter or frame local by its type (fn.params, and fn.localTypes for
// the frame locals when the front end gives them; a local without a type is an integer), every other key
// (capacities -1 - b, constants "c<n>", pointer homes "p...") by the integer class.
export function keyClass(fn, id) {
    if (typeof id === "string") return id[0] === "f" ? F : X; // "f<bits>": an f32 constant
    if (id < 0) return X;
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
        // An incoming register the leaf may keep: not a0 (the emitter's scratch), not a7 while it caches a capacity.
        // fa0 is only ever written by a return, so an f32 parameter may stay there, the first one included.
        const floating = floatingFunction(fn), a0 = floating && a0Free(fn.code);
        // A parameter on the stack, or an f32 in an x register, has no incoming register to keep.
        const keeps = p => inOwnRegister(fn, p) && (incoming[p] !== A0 || a0) && !(capacityCached && incoming[p] === A0 + 7);
        for (let p = 0; p < fn.params.length; p++) if (keeps(p) && (scores.get(p) ?? 0) >= 2) {
            homes.set(p, incoming[p]);
            opened.push({reg: incoming[p], cls: keyClass(fn, p), spans: [span(p)]});
        }
        for (const {id, arguments: args} of REGISTER_CLASSES) {
            if (closed[id]) continue;
            const used = incoming.filter(reg => reg >> 5 === id).length;
            for (let k = Math.max(1, used); k < (capacityCached && id === X ? 7 : 8); k++) free.push({reg: args[k], cls: id, cost: 0});
            if (floating) for (const reg of REGISTER_CLASSES[id].leafHomes ?? []) free.push({reg, cls: id, cost: 0});
        }
        if (floating) for (const reg of REGISTER_CLASSES[F].stack.slice(deepestStack(fn.code))) free.push({reg, cls: F, cost: 0});
        // reuseArgs: the argument register of a parameter without its own home there is free once
        // the prologue has written the parameter to its slot or home. Only a plain local, first
        // written in the body, may take it: parameter, capacity and pointer homes are filled in
        // the prologue, from the incoming registers (RAY-PARITY Step 21).
        if (reuseArgs) for (let p = 1; p < fn.params.length; p++)
            if (!homes.has(p) && keeps(p)) free.push({reg: incoming[p], cls: keyClass(fn, p), cost: 0, localsOnly: true});
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
