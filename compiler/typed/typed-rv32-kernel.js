// Generated from compiler/typed/rv32/ by compiler/typed/rv32/build.mjs. Edit those files, not this one.
// The RV32 passes of the "kernel" group: conjunctions, sets, ranges, facts. Load after typed-rv32.js.
// This code executes in the host tools and can execute in a bare QuickJS realm.
(() => {
"use strict";
if (!globalThis.typedRv32Modules) throw new Error("load typed-rv32.js before typed-rv32-kernel.js");
const {ARRAY_ADDRESS, ARRAY_ZERO, BLOCK, BR, BR_IF, CALL, CELLS, CHECKED_ADDRESS, DROP, ELSE, END, I32, I32_ADD, I32_AND, I32_CONST, I32_DIV_S, I32_DIV_U, I32_EQ, I32_EQZ, I32_GE_S, I32_GE_U, I32_GT_S, I32_GT_U, I32_LE_S, I32_LE_U, I32_LOAD, I32_LOAD16_U, I32_LT_S, I32_LT_U, I32_MUL, I32_NE, I32_OR, I32_REM_S, I32_REM_U, I32_SHL, I32_SHR_S, I32_SHR_U, I32_STORE, I32_STORE16, I32_SUB, I32_XOR, IF, LITERAL_STORES, LOCAL_GET, LOCAL_SET, LOOP, RETURN, UNCHECKED_ADDRESS, UNREACHABLE, VOID, installPasses, opClose, opNext, replaceTape} = globalThis.typedRv32Modules;

// rv32/passes/conjunctions.js
// The conjunctions pass.

// the conjunctions pass: the frontend lowers `a && b` to a value if, `a; if (result i32) b else
// const 0 end`, whose 0/1 result a following `if` or `br_if` tests again. Fused, the value is
// never materialized:
//   a; if (result i32) b else const 0 end; if BODY end   ->   a; if b; if BODY end end
//   a; if (result i32) b else const 0 end; br_if L       ->   a; if b; br_if L+1 end
// b runs exactly when a holds in both forms. BODY sits one construct deeper, so its branches
// that leave it gain one level; b keeps its depth (it was inside the value if, now inside the
// outer if). A consumer `if` with an else arm is left alone (fusing would duplicate the arm).
function fuseConjunctions(code) {
    for (let at = 0; at < code.length; at = opNext(code, at)) if (!(CELLS[code[at]] >= 0)) return null;
    let changed = false;
    for (let round = 0; round < 64; round++) {
        let rewritten = null;
        for (let s = 0; s < code.length && !rewritten; s = opNext(code, s)) {
            if (code[s] !== IF || code[s + 1] !== I32) continue;
            const t = opClose(code, s);
            let e = -1;
            for (let k = s + 2, depth = 0; k < t; k = opNext(code, k)) {
                const op = code[k];
                if (op >= BLOCK && op <= IF) depth++;
                else if (op === END) depth--;
                else if (op === ELSE && depth === 0) e = k;
            }
            if (e < 0 || t !== e + 3 || code[e + 1] !== I32_CONST || code[e + 2] !== 0) continue;
            const c = t + 1;
            if (code[c] === BR_IF) {
                rewritten = [...code.slice(0, s), IF, VOID, ...code.slice(s + 2, e), BR_IF, code[c + 1] + 1, END, ...code.slice(c + 2)];
            } else if (code[c] === IF && code[c + 1] === VOID) {
                const u = opClose(code, c);
                if (u < 0) return null;
                const body = [];
                let otherwise = false;
                for (let k = c + 2, depth = 0; k < u; k = opNext(code, k)) {
                    const op = code[k];
                    if (op === ELSE && depth === 0) otherwise = true;
                    if ((op === BR || op === BR_IF) && code[k + 1] > depth) body.push(op, code[k + 1] + 1);
                    else for (let j = k; j < opNext(code, k); j++) body.push(code[j]);
                    if (op >= BLOCK && op <= IF) depth++;
                    else if (op === END) depth--;
                }
                if (otherwise) continue;
                rewritten = [...code.slice(0, s), IF, VOID, ...code.slice(s + 2, e), IF, VOID, ...body, END, END, ...code.slice(u + 1)];
            }
        }
        if (!rewritten) break;
        code = rewritten;
        changed = true;
    }
    return changed ? code : null;
}

// rv32/passes/value-sets.js
// The sets pass.

// the sets pass: precompute a pure value block over a local that holds one of a few constants.
// A value block (`block (result i32)`) whose body is straight-line arithmetic over constants and
// at most one local L (read before the body writes it), and whose own writes are dead after the
// block, computes one result per value of L. When the forward analysis below proves that L holds
// one of at most SET_LIMIT constants on entry, the body becomes a balanced tree of comparisons
// of L against the sorted values, selecting the precomputed results:
//   get L; const v2; lt_s; if (result i32) <values below v2> else <values from v2> end
// The analysis gives each local, at each point, a set of at most SET_LIMIT i32 constants or
// unknown. It is flow-sensitive: an if joins (unions) the states its arms end in, a block joins
// its fallthrough with each branch to it, and every local a loop writes is unknown at the loop's
// start, so no loop needs iterating. A call cannot write its caller's locals. Deadness of the
// body's writes comes from a backward liveness pass: an inlined callee's locals are shared by
// every copy of it in the caller, and each copy writes them before reading them.
// The case that motivated it is the Typed ray tracer's floor colour, Pack(105, 134, 158, level)
// with level one of 117, 177, 39 and 59 (PICOCALC-RAY-PARITY Step 17).
const SET_LIMIT = 4;
// The i32 result of a comparison or arithmetic opcode, or undefined where it would trap.
function i32Fold(op, x, y) {
    switch (op) {
    case I32_EQ: return x === y ? 1 : 0;
    case I32_NE: return x !== y ? 1 : 0;
    case I32_LT_S: return x < y ? 1 : 0;
    case I32_GT_S: return x > y ? 1 : 0;
    case I32_LE_S: return x <= y ? 1 : 0;
    case I32_GE_S: return x >= y ? 1 : 0;
    case I32_GE_U: return (x >>> 0) >= (y >>> 0) ? 1 : 0;
    case I32_LT_U: return (x >>> 0) < (y >>> 0) ? 1 : 0;
    case I32_GT_U: return (x >>> 0) > (y >>> 0) ? 1 : 0;
    case I32_LE_U: return (x >>> 0) <= (y >>> 0) ? 1 : 0;
    case I32_DIV_U: return y === 0 ? undefined : Math.trunc((x >>> 0) / (y >>> 0)) | 0;
    case I32_REM_U: return y === 0 ? undefined : ((x >>> 0) % (y >>> 0)) | 0;
    case I32_ADD: return (x + y) | 0;
    case I32_SUB: return (x - y) | 0;
    case I32_MUL: return Math.imul(x, y);
    case I32_DIV_S: return y === 0 || (x === -2147483648 && y === -1) ? undefined : (x / y) | 0;
    case I32_REM_S: return y === 0 ? undefined : y === -1 ? 0 : (x % y) | 0;
    case I32_SHL: return x << (y & 31);
    case I32_AND: return x & y;
    case I32_OR: return x | y;
    case I32_XOR: return x ^ y;
    case I32_SHR_S: return x >> (y & 31);
    case I32_SHR_U: return (x >>> (y & 31)) | 0;
    }
    return undefined;
}

// Straight-line pure value blocks: {start, end, free (the one local read before written, or
// undefined), writes}.
function setCandidates(code) {
    const found = [], endOf = new Map(), open = [];
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        if (code[at] >= BLOCK && code[at] <= IF) open.push(at);
        else if (code[at] === END && open.length) endOf.set(open.pop(), at);
    }
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        if (code[at] !== BLOCK || code[at + 1] !== I32) continue;
        const end = endOf.get(at);
        if (end === undefined) return [];
        let height = 0, ok = true;
        const free = new Set(), writes = new Set();
        for (let p = at + 2; p < end && ok; p = opNext(code, p)) {
            const op = code[p], arity = op === I32_CONST || op === LOCAL_GET ? 0 : op === LOCAL_SET || op === DROP || op === I32_EQZ ? 1 : 2;
            if (op !== I32_CONST && op !== LOCAL_GET && op !== LOCAL_SET && op !== DROP && op !== I32_EQZ &&
                !((op >= I32_EQ && op <= I32_GE_U) || (op >= I32_ADD && op <= I32_SHR_U))) { ok = false; break; }
            if (height < arity) { ok = false; break; }
            if (op === LOCAL_GET && !writes.has(code[p + 1])) free.add(code[p + 1]);
            if (op === LOCAL_SET) writes.add(code[p + 1]);
            height += op === I32_CONST || op === LOCAL_GET ? 1 : op === I32_EQZ ? 0 : -1;
        }
        if (ok && height === 1 && free.size <= 1) found.push({start: at, end, free: [...free][0], writes});
    }
    return found;
}

// The value of a candidate block's body when its free local holds v, or undefined on a trap.
function evaluateSetBlock(code, block, v) {
    const stack = [], locals = new Map();
    if (block.free !== undefined) locals.set(block.free, v);
    for (let p = block.start + 2; p < block.end; p = opNext(code, p)) {
        const op = code[p], a = code[p + 1];
        if (op === I32_CONST) stack.push(a | 0);
        else if (op === LOCAL_GET) stack.push(locals.get(a));
        else if (op === LOCAL_SET) locals.set(a, stack.pop());
        else if (op === DROP) stack.pop();
        else if (op === I32_EQZ) stack.push(stack.pop() === 0 ? 1 : 0);
        else {
            const y = stack.pop(), r = i32Fold(op, stack.pop(), y);
            if (r === undefined) return undefined;
            stack.push(r);
        }
    }
    return stack.pop();
}

// The set of constants local wanted.get(start) holds on entry to each wanted block, or null.
// Only the wanted locals are tracked; every other local reads as unknown.
function entrySets(code, arity, wanted) {
    const tracked = new Set(wanted.values());
    const loopWrites = new Map(), open = [];
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (op >= BLOCK && op <= IF) open.push({op, at, writes: new Set()});
        else if (op === END && open.length) {
            const frame = open.pop();
            if (frame.op === LOOP) loopWrites.set(frame.at, frame.writes);
            if (open.length) for (const w of frame.writes) open.at(-1).writes.add(w);
        } else if (op === LOCAL_SET && open.length && tracked.has(code[at + 1])) open.at(-1).writes.add(code[at + 1]);
    }
    // A state maps a local to its possible values; an absent local is unknown.
    const join = states => states.reduce((x, y) => {
        const out = new Map();
        for (const [local, xs] of x) {
            const ys = y.get(local);
            if (!ys) continue;
            const union = [...new Set([...xs, ...ys])];
            if (union.length <= SET_LIMIT) out.set(local, union);
        }
        return out;
    });
    const apply = (op, x, y) => {
        if (!x || !y) return null;
        const out = new Set();
        for (const a of x) for (const b of y) {
            const r = i32Fold(op, a, b);
            if (r === undefined) return null;
            out.add(r);
            if (out.size > SET_LIMIT) return null;
        }
        return [...out];
    };
    let state = new Map(), dead = false;
    const stack = [], frames = [], found = new Map();
    const pop = () => stack.length ? stack.pop() : null;
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at], a = code[at + 1];
        if (op >= BLOCK && op <= IF) {
            if (!dead && wanted.has(at)) found.set(at, state.get(wanted.get(at)) ?? null);
            if (op === IF && !dead) pop();
            frames.push({op, height: stack.length, value: a !== VOID, deadEntry: dead, breaks: [], entry: state, thenEnd: null, sawElse: false});
            if (!dead && op === LOOP && loopWrites.get(at).size) {
                state = new Map(state);
                for (const w of loopWrites.get(at)) state.delete(w);
            }
            continue;
        }
        if (op === ELSE) {
            const frame = frames.at(-1);
            if (!frame) return null;
            frame.thenEnd = dead ? null : state;
            frame.sawElse = true;
            state = frame.entry;
            dead = frame.deadEntry;
            stack.length = frame.height;
            continue;
        }
        if (op === END) {
            const frame = frames.pop();
            if (!frame) continue;
            const incoming = frame.op === LOOP ? [] : [...frame.breaks];
            if (!dead) incoming.push(state);
            if (frame.op === IF && !frame.deadEntry) incoming.push(frame.sawElse ? frame.thenEnd : frame.entry);
            const reached = incoming.filter(Boolean);
            stack.length = frame.height;
            if (frame.value) stack.push(null);
            dead = !reached.length;
            if (reached.length) state = join(reached);
            continue;
        }
        if (dead) continue;
        switch (op) {
        case I32_CONST: stack.push([a | 0]); break;
        case LOCAL_GET: stack.push(state.get(a) ?? null); break;
        case LOCAL_SET: {
            const v = pop();
            if (!tracked.has(a) || (!v && !state.has(a))) break;
            state = new Map(state);
            if (v) state.set(a, v); else state.delete(a);
            break;
        }
        case DROP: pop(); break;
        case I32_EQZ: { const v = pop(); stack.push(v ? [...new Set(v.map(x => x === 0 ? 1 : 0))] : null); break; }
        case BR: case BR_IF: {
            if (op === BR_IF) pop();
            const target = frames[frames.length - 1 - a];
            if (target && target.op !== LOOP) target.breaks.push(state);
            if (op === BR) dead = true;
            break;
        }
        case RETURN: case UNREACHABLE: dead = true; break;
        case CALL:
            for (let i = arity(a); i > 0; i--) pop();
            for (let i = arity.results?.(a) ?? 1; i > 0; i--) stack.push(null);
            break;
        case I32_LOAD: case I32_LOAD16_U: pop(); stack.push(null); break;
        case I32_STORE: case I32_STORE16: pop(); pop(); break;
        case CHECKED_ADDRESS: case UNCHECKED_ADDRESS: case ARRAY_ADDRESS: stack.push(null); break;
        case LITERAL_STORES: case ARRAY_ZERO: break;
        default: {
            if (!((op >= I32_EQ && op <= I32_GE_U) || (op >= I32_ADD && op <= I32_SHR_U))) return null;
            const y = pop(), x = pop();
            stack.push(apply(op, x, y));
        }
        }
    }
    return found;
}

// For each block start in starts, the tracked locals live after the block's end.
function liveAfterBlocks(code, tracked, starts) {
    const offsets = [], indexOf = new Map(), endOf = new Map(), elseOf = new Map(), startOf = new Map(), open = [];
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        indexOf.set(at, offsets.length);
        offsets.push(at);
        const op = code[at];
        if (op >= BLOCK && op <= IF) open.push(at);
        else if (op === ELSE && open.length) elseOf.set(open.at(-1), at);
        else if (op === END && open.length) { const s = open.pop(); endOf.set(s, at); startOf.set(at, s); }
    }
    const union = (x, y) => { if (!y || !y.size) return x; const out = new Set(x); for (const v of y) out.add(v); return out; };
    const result = new Map();
    function construct(s, out, labels) {
        const op = code[s], body = indexOf.get(s) + 1, end = indexOf.get(endOf.get(s));
        const inner = [out, ...labels];
        if (op === BLOCK) {
            if (starts.has(s)) result.set(s, union(result.get(s) ?? new Set(), out));
            return seq(body, end, out, inner);
        }
        if (op === IF) {
            if (!elseOf.has(s)) return union(seq(body, end, out, inner), out);
            const otherwise = indexOf.get(elseOf.get(s));
            return union(seq(body, otherwise, out, inner), seq(otherwise + 1, end, out, inner));
        }
        // A loop's label is its own live-in: grow it to a fixed point.
        let head = new Set();
        for (;;) {
            const live = seq(body, end, out, [head, ...labels]);
            if (live.size === head.size && [...live].every(x => head.has(x))) return live;
            head = union(head, live);
        }
    }
    function seq(from, to, out, labels) {
        let live = out;
        for (let i = to - 1; i >= from; i--) {
            const at = offsets[i], op = code[at], a = code[at + 1];
            if (op === END) {
                const s = startOf.get(at);
                if (s === undefined) continue;
                live = construct(s, live, labels);
                i = indexOf.get(s);
                continue;
            }
            if (op === LOCAL_SET && live.has(a)) { live = new Set(live); live.delete(a); }
            else if ((op === LOCAL_GET || op === LITERAL_STORES) && tracked.has(a)) live = union(live, new Set([a]));
            else if (op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) { for (const x of [a, code[at + 2]]) if (tracked.has(x)) live = union(live, new Set([x])); }
            else if (op === BR) live = labels[a] ?? new Set();
            else if (op === BR_IF) live = union(live, labels[a]);
            else if (op === RETURN || op === UNREACHABLE) live = new Set();
        }
        return live;
    }
    seq(0, offsets.length, new Set(), []);
    return result;
}

// The comparison tree selecting results[i] when local holds values[i] (values sorted).
function setTree(local, values, results) {
    if (results.every(r => r === results[0])) return [I32_CONST, results[0]];
    const mid = values.length >> 1;
    return [LOCAL_GET, local, I32_CONST, values[mid], I32_LT_S, IF, I32, ...setTree(local, values.slice(0, mid), results.slice(0, mid)),
        ELSE, ...setTree(local, values.slice(mid), results.slice(mid)), END];
}

// A foldable block right after a void `if` moves into both of its arms, the if then producing the
// block's value: `if A else C end block B end` becomes `if (result i32) A block B end else C
// block B end end`. Each copy sees only its own arm's values, so it needs fewer comparisons
// (the floor colour: {117, 177} without shadow, {39, 59} in shadow). An arm that is itself
// pure straight-line code goes inside its copy, `block A B end`, so the copy also folds A and
// compares the values from before it (level / 3 needs no division). Skipped when an arm
// branches to the if itself, which would then have to carry a value.
function pureArm(code, from, to) {
    let height = 0;
    for (let p = from; p < to; p = opNext(code, p)) {
        const op = code[p];
        if (op === I32_CONST || op === LOCAL_GET) height++;
        else if (op === I32_EQZ) { if (height < 1) return false; }
        else if (op === LOCAL_SET || op === DROP) { if (--height < 0) return false; }
        else if ((op >= I32_EQ && op <= I32_GE_U) || (op >= I32_ADD && op <= I32_SHR_U)) { if (--height < 1) return false; }
        else return false;
    }
    return height === 0;
}

function sinkSetBlocks(code, blocks) {
    const out = [];
    let at = 0, changed = false;
    for (const b of blocks) {
        const ifEnd = b.start - 1;
        if (code[ifEnd] !== END) continue;
        let s = -1;
        for (let k = 0, opened = []; k < ifEnd; k = opNext(code, k)) {
            const op = code[k];
            if (op >= BLOCK && op <= IF) opened.push(k);
            else if (op === END) opened.pop();
            if (opNext(code, k) === ifEnd) s = opened.at(-1) ?? -1;
        }
        if (s < at || code[s] !== IF || code[s + 1] !== VOID || opClose(code, s) !== ifEnd) continue;
        let otherwise = -1, selfBranch = false;
        for (let k = s + 2, depth = 0; k < ifEnd; k = opNext(code, k)) {
            const op = code[k];
            if (op >= BLOCK && op <= IF) depth++;
            else if (op === END) depth--;
            else if (op === ELSE && depth === 0) otherwise = k;
            else if ((op === BR || op === BR_IF) && code[k + 1] === depth) selfBranch = true;
        }
        if (selfBranch) continue;
        const body = code.slice(b.start + 2, b.end);
        const arm = (from, to) => {
            if (pureArm(code, from, to)) out.push(BLOCK, I32, ...code.slice(from, to), ...body, END);
            else out.push(...code.slice(from, to), BLOCK, I32, ...body, END);
        };
        for (let p = at; p < s; p++) out.push(code[p]);
        out.push(IF, I32);
        if (otherwise < 0) {
            arm(s + 2, ifEnd);
            out.push(ELSE);
            arm(ifEnd, ifEnd);
        } else {
            arm(s + 2, otherwise);
            out.push(ELSE);
            arm(otherwise + 1, ifEnd);
        }
        out.push(END);
        at = b.end + 1;
        changed = true;
    }
    if (!changed) return null;
    for (let p = at; p < code.length; p++) out.push(code[p]);
    return out;
}

function foldValueSets(code, arity, sink = true) {
    for (let at = 0; at < code.length; at = opNext(code, at)) if (!(CELLS[code[at]] >= 0)) return null;
    // Only a local written a constant somewhere can have a known set: a cheap filter, since most
    // inlined blocks read parameters or loaded values.
    const constantWrites = new Set();
    for (let at = 0, prev = -1; at < code.length; prev = at, at = opNext(code, at))
        if (code[at] === LOCAL_SET && prev >= 0 && code[prev] === I32_CONST) constantWrites.add(code[at + 1]);
    const candidates = setCandidates(code).filter(c => c.free === undefined || constantWrites.has(c.free));
    if (!candidates.length) return null;
    const wanted = new Map(candidates.filter(c => c.free !== undefined).map(c => [c.start, c.free]));
    const sets = entrySets(code, arity, wanted);
    if (!sets) return null;
    const folds = [];
    for (const c of candidates) {
        const values = c.free === undefined ? [0] : sets.get(c.start)?.slice().sort((x, y) => x - y);
        if (!values) continue;
        const results = values.map(v => evaluateSetBlock(code, c, v));
        if (results.every(r => r !== undefined)) folds.push({...c, values, results});
    }
    if (!folds.length) return null;
    const tracked = new Set(folds.flatMap(f => [...f.writes]));
    const live = tracked.size ? liveAfterBlocks(code, tracked, new Set(folds.map(f => f.start))) : new Map();
    const kept = folds.filter(f => ![...f.writes].some(w => live.get(f.start)?.has(w)));
    if (!kept.length) return null;
    // The copies' values are subsets of the block's, and their writes stay dead, so they fold too.
    const sunk = sink ? sinkSetBlocks(code, kept.filter(f => f.values.length > 1)) : null;
    const refolded = sunk ? foldValueSets(sunk, arity, false) : null;
    if (refolded) return refolded;
    const out = [];
    let at = 0;
    for (const f of kept) {
        for (let p = at; p < f.start + 2; p++) out.push(code[p]);
        out.push(...setTree(f.free, f.values, f.results));
        at = f.end;
    }
    for (let p = at; p < code.length; p++) out.push(code[p]);
    return out;
}

// rv32/analysis/ranges.js
// Local value ranges and division facts (the ranges and facts passes).

// the facts pass: division and remainder by a positive constant whose dividend is never
// negative, so the emitter can drop the rounding bias and the sign correction. Two steps:
// localRanges gives every local one interval, the join of every value written to it anywhere,
// on the tape after rotation and before versioning; divisionFacts then evaluates the final tape
// (after versioning and splitting) with those intervals. Versioning and splitting change where a
// value is computed and which local holds it, never which values a local can hold, so the
// intervals stay valid: a split local takes the interval of the local it came from.
const RANGE_TOP = Object.freeze([-2147483648, 2147483647]);
const rangeFits = (lo, hi) => lo >= -2147483648 && hi <= 2147483647 ? [lo, hi] : RANGE_TOP;
const rangeJoin = (x, y) => !x ? y : !y ? x : [Math.min(x[0], y[0]), Math.max(x[1], y[1])];

// One abstract interpretation of a tape over intervals; null is "no value yet" (bottom).
// rangeOf(local) answers reads, onWrite(at, local, value) sees each local.set, and
// onDivide(at, dividend) each division or remainder by a positive constant. Buffer reads are
// [0, 65535], comparisons [0, 1], arithmetic that could leave the i32 range is unknown. Value
// blocks join the values reaching their end. Returns false on an operation it does not model.
function rangePass(code, arity, rangeOf, onWrite, onDivide) {
    const stack = [], blocks = [];
    let dead = false;
    const pop = () => stack.length ? stack.pop() : RANGE_TOP;
    const top = () => stack.length ? stack.at(-1) : RANGE_TOP;
    const reach = target => { if (target?.value) target.result = rangeJoin(target.result, top()); };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at], a = code[at + 1];
        if (dead && op !== ELSE && op !== END && !(op >= BLOCK && op <= IF)) continue;
        if (dead && op >= BLOCK && op <= IF) { blocks.push({op, value: false, height: stack.length, result: null, deadEntry: true}); continue; }
        switch (op) {
        case I32_CONST: stack.push([a, a]); break;
        case LOCAL_GET: stack.push(rangeOf(a)); break;
        case LOCAL_SET: onWrite(at, a, pop()); break;
        case DROP: pop(); break;
        case BR_IF: pop(); reach(blocks[blocks.length - 1 - a]); break;
        case BR: reach(blocks[blocks.length - 1 - a]); dead = true; break;
        case RETURN: pop(); dead = true; break;
        case UNREACHABLE: dead = true; break;
        case I32_EQZ: pop(); stack.push([0, 1]); break;
        case I32_LOAD: pop(); stack.push(RANGE_TOP); break;
        case I32_LOAD16_U: pop(); stack.push([0, 65535]); break;
        case I32_STORE: case I32_STORE16: pop(); pop(); break;
        case CHECKED_ADDRESS: case UNCHECKED_ADDRESS: case ARRAY_ADDRESS: stack.push(RANGE_TOP); break;
        case LITERAL_STORES: case ARRAY_ZERO: break;
        case CALL:
            for (let i = arity(a); i > 0; i--) pop();
            for (let i = arity.results?.(a) ?? 1; i > 0; i--) stack.push(RANGE_TOP);
            break;
        case BLOCK: case LOOP: case IF:
            if (op === IF) pop();
            blocks.push({op, value: a !== VOID, height: stack.length, result: null});
            break;
        case ELSE: case END: {
            const block = op === ELSE ? blocks.at(-1) : blocks.pop();
            if (!block) break;
            if (block.value && !dead) block.result = rangeJoin(block.result, top());
            stack.length = block.height;
            dead = block.deadEntry ?? false;
            if (op === END && block.value) stack.push(block.result ?? RANGE_TOP);
            break;
        }
        default: {
            if (!((op >= I32_EQ && op <= I32_GE_U) || (op >= I32_ADD && op <= I32_SHR_U))) return false;
            const y = pop(), x = pop();
            let r = RANGE_TOP;
            if (op <= I32_GE_U) r = [0, 1];
            else if (!x || !y) r = null;
            else if (op === I32_ADD) r = rangeFits(x[0] + y[0], x[1] + y[1]);
            else if (op === I32_SUB) r = rangeFits(x[0] - y[1], x[1] - y[0]);
            else if (op === I32_MUL) {
                const p = [x[0] * y[0], x[0] * y[1], x[1] * y[0], x[1] * y[1]];
                r = rangeFits(Math.min(...p), Math.max(...p));
            } else if ((op === I32_DIV_S || op === I32_REM_S) && y[0] === y[1] && y[0] > 0) {
                const d = y[0];
                onDivide(at, x);
                r = op === I32_DIV_S ? [Math.trunc(x[0] / d), Math.trunc(x[1] / d)]
                    : x[0] >= 0 ? [0, Math.min(x[1], d - 1)] : [-(d - 1), d - 1];
            } else if (op === I32_SHR_S && y[0] === y[1] && y[0] >= 0 && y[0] < 32) r = [x[0] >> y[0], x[1] >> y[0]];
            else if (op === I32_AND && (x[0] >= 0 || y[0] >= 0))
                r = [0, Math.min(x[0] >= 0 ? x[1] : Infinity, y[0] >= 0 ? y[1] : Infinity)]; // a non-negative operand bounds it
            else if (op === I32_REM_U && y[0] === y[1] && y[0] > 0) r = [0, y[0] - 1];
            else if (op === I32_DIV_U && y[0] === y[1] && y[0] > 0 && x[0] >= 0) r = [Math.trunc(x[0] / y[0]), Math.trunc(x[1] / y[0])];
            else if (op === I32_SHR_U && y[0] === y[1] && y[0] > 0 && y[0] < 32)
                r = x[0] >= 0 ? [x[0] >>> y[0], x[1] >>> y[0]] : [0, 2 ** (32 - y[0]) - 1];
            stack.push(r);
        }
        }
    }
    return true;
}

// Interval of every local that is written before it is read in tape order; a local missing
// from the result is unknown. The counter k of a rotated counted loop (the shape versionLoops
// matches: the test k < N enters the loop, its only write of k is a final k = k + s, and N is a
// constant or a local the loop does not write) is bounded by max(N) - 1 + s instead of growing
// pass by pass, since the increment only runs after k < N held.
function localRanges(code, params, arity) {
    // Most functions divide by no constant: one scan, and no intervals to compute.
    let divides = false;
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        if (!(CELLS[code[at]] >= 0)) return null;
        if (code[at] === I32_CONST && code[at + 1] > 0 && (code[at + 2] === I32_DIV_S || code[at + 2] === I32_REM_S)) divides = true;
    }
    if (!divides) return null;
    const counters = new Map();
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        if (code[at] !== BLOCK || code[at + 1] !== VOID || code[at + 2] !== LOCAL_GET || code[at + 6] !== I32_LT_S || code[at + 7] !== I32_EQZ ||
            code[at + 8] !== BR_IF || code[at + 9] !== 0 || code[at + 10] !== LOOP || code[at + 11] !== VOID) continue;
        const k = code[at + 3], boundOp = code[at + 4], bound = code[at + 5];
        if (boundOp !== I32_CONST && boundOp !== LOCAL_GET) continue;
        const loopEnd = opClose(code, at + 10);
        if (loopEnd < 0 || opClose(code, at) !== loopEnd + 1) continue;
        const inc = loopEnd - 14;
        if (inc < at + 12 || code[inc] !== LOCAL_GET || code[inc + 1] !== k || code[inc + 2] !== I32_CONST || code[inc + 4] !== I32_ADD ||
            code[inc + 5] !== LOCAL_SET || code[inc + 6] !== k || !(code[inc + 3] >= 1 && code[inc + 3] <= 64)) continue;
        if (code[inc + 7] !== LOCAL_GET || code[inc + 8] !== k || code[inc + 9] !== boundOp || code[inc + 10] !== bound ||
            code[inc + 11] !== I32_LT_S || code[inc + 12] !== BR_IF || code[inc + 13] !== 0) continue;
        let writes = 0, boundWritten = false;
        for (let p = at + 12; p < loopEnd; p = opNext(code, p)) if (code[p] === LOCAL_SET) {
            if (code[p + 1] === k) writes++;
            if (boundOp === LOCAL_GET && code[p + 1] === bound) boundWritten = true;
        }
        if (writes === 1 && !boundWritten)
            counters.set(inc + 5, {bound: boundOp === I32_CONST ? [bound, bound] : null, local: bound, step: code[inc + 3]});
    }
    const seen = new Set(), unknown = new Set();
    const touch = (x, write) => { if (x >= params && !seen.has(x) && !write) unknown.add(x); seen.add(x); };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (op === LOCAL_GET || op === LITERAL_STORES) touch(code[at + 1], false);
        else if (op === LOCAL_SET) touch(code[at + 1], true);
        else if (op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) { touch(code[at + 1], false); touch(code[at + 2], false); }
    }
    const ranges = new Map();
    const rangeOf = local => local < params || unknown.has(local) ? RANGE_TOP : ranges.get(local) ?? null;
    // Intervals only grow. From the third pass a bound that still moves is widened: a falling
    // lower bound to 0 when it is still non-negative (the property divisions need), otherwise to
    // the i32 limit, and a rising upper bound to the i32 limit. Each bound then moves at most
    // twice more, so the passes are bounded. Without a fixed point there are no intervals.
    for (let round = 0; round < 16; round++) {
        const next = new Map();
        const onWrite = (at, local, value) => {
            const counter = counters.get(at);
            if (counter) {
                const k = rangeOf(local), n = counter.bound ?? rangeOf(counter.local);
                value = k && n ? rangeFits(k[0] + counter.step, n[1] + counter.step - 1) : null;
            }
            if (value) next.set(local, rangeJoin(next.get(local), value));
        };
        if (!rangePass(code, arity, rangeOf, onWrite, () => {})) return null;
        let stable = true;
        for (const [local, value] of next) {
            const old = ranges.get(local);
            let merged = rangeJoin(old, value);
            if (!old || old[0] !== merged[0] || old[1] !== merged[1]) {
                stable = false;
                if (round >= 2 && old) merged = [merged[0] < old[0] ? (merged[0] >= 0 ? 0 : RANGE_TOP[0]) : old[0],
                    merged[1] > old[1] ? RANGE_TOP[1] : old[1]];
            }
            ranges.set(local, merged);
        }
        if (stable) {
            for (const local of unknown) ranges.delete(local);
            return ranges;
        }
    }
    return null;
}

// Offsets of the division and remainder operations of the final tape whose dividend is known
// non-negative. origin maps a local of the final tape to the local of localRanges' tape.
function divisionFacts(code, params, arity, ranges, origin) {
    const facts = new Set();
    const rangeOf = local => local < params ? RANGE_TOP : ranges.get(origin(local)) ?? RANGE_TOP;
    return rangePass(code, arity, rangeOf, () => {}, (at, x) => { if (x && x[0] >= 0) facts.add(at); }) ? facts : null;
}

// rv32/passes/kernel-group.js
// The "kernel" group (typed-rv32-kernel.js): the passes only "kernel" runs, conjunctions, sets, ranges and facts.
// Loading this module installs them in the registry.

installPasses("kernel", {
    conjunctions: {run: fn => replaceTape(fn, fuseConjunctions(fn.code))},
    sets: {run: (fn, ctx) => replaceTape(fn, foldValueSets(fn.code, ctx.arity))},
    ranges: {run(fn, ctx) { ctx.ranges = localRanges(fn.code, fn.params.length, ctx.arity); }},
    // ctx.origin maps a local that split made to the local it came from (the loops group's split sets it).
    facts: {run(fn, ctx) {
        if (ctx.ranges) ctx.facts = divisionFacts(fn.code, fn.params.length, ctx.arity, ctx.ranges, ctx.origin) ?? undefined;
    }},
});
// A marker for loaders that list what a realm holds (the trace-REPL workbench's module table).
globalThis.typedRv32Kernel = {group: "kernel"};
})();
