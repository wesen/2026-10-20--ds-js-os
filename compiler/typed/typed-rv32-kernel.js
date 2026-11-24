// Generated from compiler/typed/rv32/ by compiler/typed/rv32/build.mjs. Edit those files, not this one.
// The RV32 passes of the "kernel" group: conjunctions, sets, ranges, rows, coalesce, facts. Load after typed-rv32.js.
// This code executes in the host tools and can execute in a bare QuickJS realm.
(() => {
"use strict";
if (!globalThis.typedRv32Modules) throw new Error("load typed-rv32.js before typed-rv32-kernel.js");
const {ARRAY_ADDRESS, ARRAY_ZERO, BLOCK, BR, BR_IF, CALL, CELLS, CHECKED_ADDRESS, DROP, EFFECTS, ELSE, END, F32_CONST, F32_LOAD, I32, I32_ADD, I32_AND, I32_CONST, I32_DIV_S, I32_DIV_U, I32_EQ, I32_EQZ, I32_GE_S, I32_GE_U, I32_GT_S, I32_GT_U, I32_LE_S, I32_LE_U, I32_LOAD, I32_LOAD16_U, I32_LT_S, I32_LT_U, I32_MUL, I32_NE, I32_OR, I32_REM_S, I32_REM_U, I32_SHL, I32_SHR_S, I32_SHR_U, I32_STORE, I32_STORE16, I32_SUB, I32_XOR, IF, LITERAL_STORES, LOCAL_GET, LOCAL_SET, LOOP, RETURN, STORES, UNCHECKED_ADDRESS, UNREACHABLE, VOID, floatingFunction, installPasses, opClose, opNext, replaceTape, tapeRow} = globalThis.typedRv32Modules;

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

// rv32/passes/coalesce.js
// The coalesce pass.

// coalesce (PICOCALC-CANDELA-KERNEL-CODEGEN): an f32 copy `b = a` whose source dies at the copy and whose
// destination is born there makes b and a one local, and a copy of a local into itself disappears. Value records
// copy every leaf where a value moves (a declaration from a call's record result, an inlined callee's result locals,
// a parameter copied into a mutable local), and each copy of a local the planner left in a slot is a load and a
// store; one local per chain needs none.
//
// Liveness is the planner's (planLocations' share): a local lives from its first to its last occurrence in tape
// order, a parameter from the entry, and an interval that reaches into a loop from before it covers the whole loop
// (innermost loops first); a local whose first occurrence is a read lives everywhere and is left alone. A copy is
// a `local.set b` whose value is a `local.get a` on the abstract operand stack (the leaves of a value record are
// pushed together and stored last first). It coalesces when both are f32 locals, b is not a parameter, a's
// interval (merged with earlier coalesced locals) ends at the get and b's starts at the set: a is dead after the get
// and b holds no value before the set, so one local holds both values in turn. Chains coalesce in tape order.
// After renaming, a `local.set x` of a `local.get x` that no write of x separates is deleted with the get (the
// operations between them never reach below the value). The locals no occurrence names any more are removed and the
// rest renumbered; `origin` (the split pass's map to the analysed locals) is composed with the renumbering.
// Only f32 locals take part: an integer local can feed division facts and buffer addresses, and integer programs
// keep their pinned images.
function coalesceCopies(fn, arity, origin) {
    const code = fn.code, params = fn.params.length, total = params + fn.nlocals;
    const isFloat = local => (local < params ? fn.params[local] : fn.localTypes?.[local - params]) === "f32";
    // Intervals.
    const first = new Int32Array(total).fill(-1), last = new Int32Array(total).fill(-1), readFirst = new Uint8Array(total);
    const loopSpans = [], loopStarts = [], opened = [];
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (!(CELLS[op] >= 0)) return null;
        const occur = (local, read) => {
            if (first[local] < 0) { first[local] = at; if (read) readFirst[local] = 1; }
            last[local] = at;
        };
        if (op === LOCAL_GET || op === LITERAL_STORES) occur(code[at + 1], true);
        else if (op === LOCAL_SET) occur(code[at + 1], false);
        else if (op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) { occur(code[at + 1], true); occur(code[at + 2], true); }
        if (op >= BLOCK && op <= IF) { opened.push(op); if (op === LOOP) loopStarts.push(at); }
        else if (op === END && opened.length && opened.pop() === LOOP) loopSpans.push([loopStarts.pop(), at]);
    }
    const start = local => local < params ? -1 : first[local];
    const end = Int32Array.from(last);
    loopSpans.sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
    for (const [ls, le] of loopSpans)
        for (let i = 0; i < total; i++) if (last[i] >= 0 && start(i) < ls && end[i] >= ls && end[i] < le) end[i] = le;

    // Copies, with an abstract operand stack: an entry is the local a plain local.get pushed, or -1.
    const rep = Int32Array.from({length: total}, (_, i) => i);
    const find = x => { while (rep[x] !== x) x = rep[x] = rep[rep[x]]; return x; };
    let merged = 0;
    walkCopies(code, arity, (a, g, b, s) => {
        const ra = find(a);
        if (b < params || ra === b || !isFloat(a) || !isFloat(b) || readFirst[b] || (ra >= params && readFirst[ra])) return;
        if (first[b] !== s || end[ra] !== g) return;
        rep[b] = ra;
        end[ra] = end[b];
        merged++;
    });
    if (!merged) return null;

    // Rename, then delete the copies of a local into itself.
    const out = code.slice();
    for (let at = 0; at < out.length; at = opNext(out, at))
        if (out[at] === LOCAL_GET || out[at] === LOCAL_SET) out[at + 1] = find(out[at + 1]);
    const dead = new Set();
    walkCopies(out, arity, (a, g, b, s) => { if (a === b) { dead.add(g); dead.add(s); } });
    // Renumber the locals still named.
    const used = new Uint8Array(total);
    for (let i = 0; i < params; i++) used[i] = 1;
    for (let at = 0; at < out.length; at = opNext(out, at)) {
        if (dead.has(at)) continue;
        const op = out[at];
        if (op === LOCAL_GET || op === LOCAL_SET || op === LITERAL_STORES) used[out[at + 1]] = 1;
        else if (op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) used[out[at + 1]] = used[out[at + 2]] = 1;
    }
    const index = new Int32Array(total).fill(-1), from = [];
    for (let i = 0; i < total; i++) if (used[i]) { index[i] = from.length; from.push(i); }
    const result = [];
    for (let at = 0; at < out.length; at = opNext(out, at)) {
        if (dead.has(at)) continue;
        const op = out[at], next = opNext(out, at), operand = result.length + 1;
        for (let k = at; k < next; k++) result.push(out[k]);
        if (op === LOCAL_GET || op === LOCAL_SET || op === LITERAL_STORES) result[operand] = index[out[at + 1]];
        else if (op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) {
            result[operand] = index[out[at + 1]];
            result[operand + 1] = index[out[at + 2]];
        }
    }
    const nlocals = from.length - params;
    const localTypes = fn.localTypes ? from.slice(params).map(i => fn.localTypes[i - params]) : undefined;
    return {code: result, nlocals, localTypes, origin: local => origin(from[local])};
}

// Calls onCopy(a, getAt, b, setAt) for each local.set b whose value is the value a plain local.get a pushed, with no
// write of a between them. Blocks restore the stack height at else and end; code after br, return and unreachable
// is skipped to the end of its block.
function walkCopies(code, arity, onCopy) {
    const local = [], getAt = [], blocks = [];
    let sp = 0, dead = 0;
    const push = (l, at) => { local[sp] = l; getAt[sp] = at; sp++; };
    const pop = n => { sp = Math.max(0, sp - n); };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (dead) {
            if (op >= BLOCK && op <= IF) dead++;
            else if (op === END && --dead === 0) { const b = blocks.pop(); if (b) sp = b.height + Number(b.value); }
            else if (op === ELSE && dead === 1) { dead = 0; sp = blocks.at(-1).height; }
            continue;
        }
        if (op === LOCAL_GET) push(code[at + 1], at);
        else if (op === LOCAL_SET) {
            const b = code[at + 1];
            if (sp > 0) {
                const a = local[sp - 1];
                sp--;
                if (a >= 0) onCopy(a, getAt[sp], b, at);
            }
            for (let i = 0; i < sp; i++) if (local[i] === b) local[i] = -1;
        } else if (op >= BLOCK && op <= IF) {
            if (op === IF) pop(1);
            blocks.push({height: sp, value: code[at + 1] !== VOID});
        } else if (op === ELSE) sp = blocks.at(-1).height;
        else if (op === END) {
            if (blocks.length) { const b = blocks.pop(); sp = b.height; if (b.value) push(-1, at); }
        } else if (op === BR || op === RETURN || op === UNREACHABLE) dead = 1;
        else if (op === CALL) {
            pop(arity(code[at + 1]));
            for (let n = arity.results?.(code[at + 1]) ?? 1; n > 0; n--) push(-1, at);
        } else {
            const row = tapeRow(op);
            pop(row.pop.length);
            for (let n = row.push.length; n > 0; n--) push(-1, at);
        }
    }
}

// rv32/passes/rows.js
// The rows pass.

// rows (PICOCALC-CANDELA-KERNEL-CODEGEN): f32 reads of one buffer at constant distances, as a kernel reads a row of
// vectors (`b.getF32(a)`, `b.getF32(a + 1)` ... ), share one range check and one address. Each `b.getF32(E)` is
// written `E; const 1; shl; const 1; add; set p; checked_address b p; f32.load 2 2` (unit 2E + 1 is checked, the
// load reads at b + 4 + 4E).
//
// Within one straight stretch of tape (no block, branch, call or store) the pass knows each i32 value as an affine
// form a·X + c of one local X, where it can: a literal, a local, sums, differences, and products and shifts by
// literals, through the locals they are stored in. It knows a buffer by the local that holds it, or, for a local set
// from \`local.get q; i32.load off\` (a field of a record such as Candela's K), by that field. Reads of the same
// buffer whose indices have the same X and a form a group, at offsets c; a write of X, of the buffer's local, or of
// q ends it. A group of three or more becomes, where its first read's index began:
//     P = 2(a·X + cmin) + 1; trap unless P <u capacity(b); trap unless P + 2(cmax - cmin) <u capacity(b);
//     Q = b + 2P
// and each read a load from Q at 2 + 4(c - cmin): one instruction for a homed Q. The arithmetic is the reads' own,
// modulo 2^32, so P is each read's checked unit for its c. The two checks together are exact: P is below a capacity
// under 2^31, so P + 2d does not wrap and every unit from P to P + 2d is in range exactly when both are. A group of
// literal indices needs only the check of its largest and loads from b itself at 4 + 4c. A read that would trap traps
// at the group's start instead of at itself; nothing between them stores to memory, calls or branches, so the memory
// a trap leaves is the same.
//
// The index and buffer computations the grouped reads no longer use are then removed: a local that nothing reads any
// more loses every store of a pure value (locals, literals, i32 arithmetic and loads).
// The pass runs only on f32 functions (integer programs keep their pinned images).
const MIN_GROUP = 3;
const BOUNDARY = new Set([BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, RETURN, UNREACHABLE, CALL]);
// Operations whose value the pass follows as an affine form; the only ones an index expression may contain.
const FORM_OPS = new Set([LOCAL_GET, I32_CONST, I32_ADD, I32_SUB, I32_MUL, I32_SHL, I32_LOAD]);
// Operations a removed store's value may contain: no effect, no trap.
const PURE_OPS = new Set([...FORM_OPS, F32_CONST]);
const UNKNOWN = {form: null, field: null, local: -1, start: -1};

// The read suffix at `at` (after its index E): {pos, r, end}, or null.
function suffixAt(code, x) {
    if (!(code[x] === I32_CONST && code[x + 1] === 1 && code[x + 2] === I32_SHL && code[x + 3] === I32_CONST &&
        code[x + 4] === 1 && code[x + 5] === I32_ADD && code[x + 6] === LOCAL_SET && code[x + 8] === CHECKED_ADDRESS &&
        code[x + 10] === code[x + 7] && code[x + 11] === F32_LOAD && code[x + 12] === 2 && code[x + 13] === 2)) return null;
    return {pos: code[x + 7], r: code[x + 9], end: x + 14};
}

const only = (code, from, to, ops) => {
    for (let at = from; at < to; at = opNext(code, at)) if (!ops.has(code[at])) return false;
    return true;
};

// A form with a = 0 is a literal: its x is -1.
const literal = f => f && f.a === 0 ? {x: -1, a: 0, c: f.c} : f;
function combine(op, f, g) {
    return literal(combine2(op, f, g));
}
function combine2(op, f, g) {
    if (!f || !g) return null;
    const x = f.a === 0 ? g.x : f.x;
    if (f.a !== 0 && g.a !== 0 && f.x !== g.x) return null;
    if (op === I32_ADD) return {x, a: (f.a + g.a) | 0, c: (f.c + g.c) | 0};
    if (op === I32_SUB) return {x, a: (f.a - g.a) | 0, c: (f.c - g.c) | 0};
    if (op === I32_MUL && g.a === 0) return {x: f.x, a: Math.imul(f.a, g.c), c: Math.imul(f.c, g.c)};
    if (op === I32_MUL && f.a === 0) return {x: g.x, a: Math.imul(g.a, f.c), c: Math.imul(g.c, f.c)};
    if (op === I32_SHL && g.a === 0) { const s = g.c & 31; return {x: f.x, a: f.a << s, c: f.c << s}; }
    return null;
}

function findGroups(code) {
    const groups = [], open = new Map();
    let stack = [];
    const affine = new Map(), field = new Map();
    const close = key => { const g = open.get(key); if (g) { open.delete(key); if (g.reads.length >= MIN_GROUP) groups.push(g); } };
    const closeWhere = test => { for (const [key, g] of [...open]) if (test(g)) close(key); };
    const reset = () => { closeWhere(() => true); stack = []; affine.clear(); field.clear(); };
    const pop = () => stack.length ? stack.pop() : UNKNOWN;
    // A write of local L: forms in terms of L, fields of L and groups that depend on L end.
    const written = L => {
        closeWhere(g => g.x === L || g.buffer === "l" + L || g.base === L);
        for (const [k, f] of [...affine]) if (f.x === L) affine.delete(k);
        for (const [k, f] of [...field]) if (f.base === L) field.delete(k);
        stack = stack.map(e => (e.form?.x === L || e.field?.base === L) ? {...e, form: e.form?.x === L ? null : e.form,
            field: e.field?.base === L ? null : e.field} : e);
    };
    for (let at = 0; at < code.length;) {
        const op = code[at];
        if (!(CELLS[op] >= 0)) return null;
        const read = op === I32_CONST ? suffixAt(code, at) : null;
        if (read && stack.length) {
            const e = stack.at(-1);
            const index = e.form && e.start >= 0 && only(code, e.start, at, FORM_OPS) ? e.form : null;
            const buffer = field.get(read.r);
            if (index && (index.x >= 0 || (index.c >= 0 && index.c <= 500))) {
                stack.pop();
                const key = (buffer ? "f" + buffer.base + ":" + buffer.off : "l" + read.r) + "/" + index.x + "/" + index.a;
                let g = open.get(key);
                if (g) {
                    const cs = g.reads.map(x => x.c);
                    if (Math.max(...cs, index.c) - Math.min(...cs, index.c) > 500) { close(key); g = undefined; }
                }
                if (!g) open.set(key, g = {x: index.x, a: index.a, buffer: buffer ? null : "l" + read.r,
                    base: buffer ? buffer.base : -1, reads: []});
                g.reads.push({start: e.start, end: read.end, c: index.c, r: read.r});
                written(read.pos);
                stack.push({...UNKNOWN});
                at = read.end;
                continue;
            }
        }
        if (BOUNDARY.has(op) || (EFFECTS[op] & STORES)) {
            reset();
            at = opNext(code, at);
            continue;
        }
        const a = code[at + 1];
        if (op === LOCAL_GET) stack.push({form: affine.get(a) ?? {x: a, a: 1, c: 0}, field: field.get(a) ?? null, local: a, start: at});
        else if (op === I32_CONST) stack.push({form: {x: -1, a: 0, c: a}, field: null, local: -1, start: at});
        else if (op === LOCAL_SET) {
            const e = pop();
            written(a);
            if (e.form && e.form.x !== a) affine.set(a, e.form);
            if (e.field) field.set(a, e.field);
        } else if (op === I32_LOAD) {
            const e = pop();
            const known = e.local >= 0 && e.form?.x === e.local && e.form.a === 1 && e.form.c === 0;
            stack.push({form: null, field: known ? {base: e.local, off: code[at + 2]} : null, local: -1, start: e.start});
        } else if (op === I32_ADD || op === I32_SUB || op === I32_MUL || op === I32_SHL) {
            const g = pop(), f = pop();
            const start = f.start >= 0 && g.start >= 0 ? Math.min(f.start, g.start) : -1;
            stack.push({form: combine(op, f.form, g.form), field: null, local: -1, start});
        } else {
            const row = tapeRow(op);
            for (let n = row.pop.length; n > 0; n--) pop();
            for (let n = row.push.length; n > 0; n--) stack.push(UNKNOWN);
        }
        at = opNext(code, at);
    }
    reset();
    return groups;
}

// Removes `value; local.set L` for every local L nothing reads, when the value is pure; repeats while that frees more.
function deadStores(code, params) {
    for (let round = 0; round < 8; round++) {
        const reads = new Set();
        for (let at = 0; at < code.length; at = opNext(code, at)) {
            if (code[at] === LOCAL_GET) reads.add(code[at + 1]);
            if (code[at] === CHECKED_ADDRESS || code[at] === UNCHECKED_ADDRESS) reads.add(code[at + 1]).add(code[at + 2]);
            if (code[at] === LITERAL_STORES) reads.add(code[at + 1]);
        }
        const cut = [];
        let starts = [];
        for (let at = 0; at < code.length; at = opNext(code, at)) {
            const op = code[at];
            if (BOUNDARY.has(op)) { starts = []; continue; }
            if (op === LOCAL_SET && !reads.has(code[at + 1])) {
                const start = starts.length ? starts.at(-1) : -1;
                if (start >= 0 && only(code, start, at, PURE_OPS) && balanced(code, start, at)) cut.push([start, at + 2]);
            }
            const row = tapeRow(op);
            const pops = op === LOCAL_SET ? 1 : row.pop?.length ?? 0, pushes = row.push?.length ?? 0;
            let start = at;
            for (let n = 0; n < pops; n++) { const s = starts.length ? starts.pop() : -1; start = s < 0 || start < 0 ? -1 : Math.min(start, s); }
            for (let n = 0; n < pushes; n++) starts.push(start);
        }
        if (!cut.length) return code;
        const out = [];
        let c = 0;
        for (let at = 0; at < code.length;) {
            if (c < cut.length && at === cut[c][0]) { at = cut[c][1]; c++; continue; }
            const next = opNext(code, at);
            for (let k = at; k < next; k++) out.push(code[k]);
            at = next;
        }
        code = out;
    }
    return code;
}

// [from, to) leaves exactly one value and never pops below its start.
function balanced(code, from, to) {
    let depth = 0;
    for (let at = from; at < to; at = opNext(code, at)) {
        const row = tapeRow(code[at]);
        depth -= code[at] === LOCAL_SET ? 1 : row.pop.length;
        if (depth < 0) return false;
        depth += row.push.length;
    }
    return depth === 1;
}

function groupRowReads(fn) {
    const code = fn.code;
    const groups = findGroups(code);
    if (!groups?.length) return null;
    // Rewrite: a header before each group's first read, a load from the group's base for each read.
    let locals = fn.params.length + fn.nlocals;
    const header = new Map(), replace = new Map();
    for (const g of groups) {
        const cs = g.reads.map(x => x.c), cmin = Math.min(...cs), cmax = Math.max(...cs), first = g.reads[0];
        const check = (r, position) => [...position, LOCAL_GET, r, I32_LOAD, 2, 0, I32_GE_U, IF, VOID, UNREACHABLE, END];
        if (g.x < 0) {
            header.set(first.start, check(first.r, [I32_CONST, 2 * cmax + 1]));
            for (const x of g.reads) replace.set(x.start, {end: x.end, cells: [LOCAL_GET, x.r, F32_LOAD, 2, 4 + 4 * x.c]});
            continue;
        }
        const P = locals++, Q = locals++;
        const cells = [LOCAL_GET, g.x, ...(g.a !== 1 ? [I32_CONST, g.a, I32_MUL] : []), ...(cmin ? [I32_CONST, cmin, I32_ADD] : []),
            I32_CONST, 1, I32_SHL, I32_CONST, 1, I32_ADD, LOCAL_SET, P, ...check(first.r, [LOCAL_GET, P])];
        if (cmax > cmin) cells.push(...check(first.r, [LOCAL_GET, P, I32_CONST, 2 * (cmax - cmin), I32_ADD]));
        cells.push(LOCAL_GET, first.r, LOCAL_GET, P, I32_CONST, 1, I32_SHL, I32_ADD, LOCAL_SET, Q);
        header.set(first.start, cells);
        for (const x of g.reads) replace.set(x.start, {end: x.end, cells: [LOCAL_GET, Q, F32_LOAD, 2, 2 + 4 * (x.c - cmin)]});
    }
    let out = [];
    for (let at = 0; at < code.length;) {
        const h = header.get(at);
        if (h) out.push(...h);
        const r = replace.get(at);
        if (r) { out.push(...r.cells); at = r.end; continue; }
        const next = opNext(code, at);
        for (let k = at; k < next; k++) out.push(code[k]);
        at = next;
    }
    out = deadStores(out, fn.params.length);
    const added = locals - fn.params.length - fn.nlocals;
    const localTypes = fn.localTypes ? [...fn.localTypes] : [];
    for (let i = localTypes.length; i < locals - fn.params.length; i++) localTypes[i] ??= "i32";
    return {code: out, nlocals: fn.nlocals + added, localTypes: fn.localTypes || added ? localTypes : undefined, groups: groups.length};
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
// The "kernel" group (typed-rv32-kernel.js): the passes only "kernel" runs, conjunctions, sets, ranges, rows, coalesce
// and facts. Loading this module installs them in the registry.

installPasses("kernel", {
    conjunctions: {run: fn => replaceTape(fn, fuseConjunctions(fn.code))},
    sets: {run: (fn, ctx) => replaceTape(fn, foldValueSets(fn.code, ctx.arity))},
    ranges: {run(fn, ctx) { ctx.ranges = localRanges(fn.code, fn.params.length, ctx.arity); }},
    rows: {run(fn) {
        if (!floatingFunction(fn)) return undefined;
        const grouped = groupRowReads(fn);
        if (!grouped) return undefined;
        fn.code = grouped.code;
        fn.nlocals = grouped.nlocals;
        if (grouped.localTypes) fn.localTypes = grouped.localTypes;
        return "changed";
    }},
    coalesce: {run(fn, ctx) {
        if (!floatingFunction(fn)) return undefined;
        const coalesced = coalesceCopies(fn, ctx.arity, ctx.origin);
        if (!coalesced) return undefined;
        fn.code = coalesced.code;
        fn.nlocals = coalesced.nlocals;
        if (coalesced.localTypes) fn.localTypes = coalesced.localTypes;
        ctx.origin = coalesced.origin;
        return "changed";
    }},
    // ctx.origin maps a local that split or coalesce made to the local it came from (the loops group's split sets it).
    facts: {run(fn, ctx) {
        if (ctx.ranges) ctx.facts = divisionFacts(fn.code, fn.params.length, ctx.arity, ctx.ranges, ctx.origin) ?? undefined;
    }},
});
// A marker for loaders that list what a realm holds (the trace-REPL workbench's module table).
globalThis.typedRv32Kernel = {group: "kernel"};
})();
