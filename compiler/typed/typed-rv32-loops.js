// Generated from compiler/typed/rv32/ by compiler/typed/rv32/build.mjs. Edit those files, not this one.
// The RV32 passes of the "loops" group: version, hoist, induction, split. Load after typed-rv32.js.
// This code executes in the host tools and can execute in a bare QuickJS realm.
(() => {
"use strict";
if (!globalThis.typedRv32Modules) throw new Error("load typed-rv32.js before typed-rv32-loops.js");
const {ARRAY_ADDRESS, ARRAY_ZERO, BLOCK, BR, BR_IF, CALL, CELLS, CHECKED_ADDRESS, DROP, ELSE, END, I32, I32_ADD, I32_CONST, I32_DIV_S, I32_DIV_U, I32_EQ, I32_EQZ, I32_GE_S, I32_GE_U, I32_GT_S, I32_LOAD, I32_LOAD16_U, I32_LT_S, I32_MUL, I32_REM_S, I32_REM_U, I32_SHR_U, I32_STORE, I32_STORE16, I32_SUB, IF, LITERAL_STORES, LOCAL_GET, LOCAL_SET, LOOP, RETURN, UNCHECKED_ADDRESS, UNREACHABLE, VOID, installPasses, opClose, opNext, replaceTape} = globalThis.typedRv32Modules;

// rv32/passes/hoist.js
// The hoist option of the version pass: loop invariants and subexpressions into the guard block.

// A division or remainder: it traps on a zero divisor (and div_s on -2^31 / -1), so it moves only with a literal divisor.
const dividing = op => op === I32_DIV_S || op === I32_REM_S || op === I32_DIV_U || op === I32_REM_U;

// the hoist pass: a statement of a versioned loop's fast copy that computes the same value in
// every iteration moves into the guard block, after the guard's terms and before the loop.
// A statement `E; set X` moves when:
//  - E reads only constants, locals the loop does not write (or that a moved statement writes),
//    capacities (`get r; load32 2 0`) and loads through this level's unchecked accesses (UNCHECKED_ADDRESS)
//    with invariant buffer and index; E divides only by constants other than 0 and -1. So E
//    cannot trap, and the guard has already proved those accesses in range;
//  - X is written once in the loop, every read of X in the loop follows that write inside the
//    write's own region, so no read sees an earlier value, and nothing outside the loop reads X;
//  - for a load from buffer r: the loop stores nothing to r, every store's buffer is known, every
//    call is to a function that stores nothing, and the guard gains `s == r` (to the slow copy)
//    for each buffer s the loop stores to, since a store through s could reach r's memory.
// A moved load runs once even if no iteration would have reached it; it cannot trap, and its
// value is read only where the original load ran. A statement that only copies a constant or a
// local (`const 17; set t`, an access's index) saves nothing by itself and is better left
// where an access can fold it into a displacement: it is copied to the guard block, and also
// kept in the loop, only when a moved statement reads its local. In the ray tracer, InShadow's light vector,
// sphere count and 4096 + 32y move out of the row loop (PICOCALC-RAY-PARITY Step 18).
function hoistInvariants(body, unchecked, k, readOutside, storeless, arity) {
    const ops = [];
    for (let p = 0; p < body.length; p = opNext(body, p)) ops.push(p);
    const writes = new Map(), readsOf = new Map();
    for (let i = 0; i < ops.length; i++) {
        const p = ops[i], op = body[p];
        if (op === LOCAL_SET) writes.set(body[p + 1], (writes.get(body[p + 1]) ?? 0) + 1);
        const locals = op === LOCAL_GET || op === LITERAL_STORES ? [body[p + 1]] : op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS ? [body[p + 1], body[p + 2]] : [];
        for (const x of locals) { if (!readsOf.has(x)) readsOf.set(x, []); readsOf.get(x).push(i); }
    }
    // Statements (ops start..set at their construct's entry height), stored buffers, calls.
    const statements = [], stored = new Set(), frames = [{base: 0, value: false, deadEntry: false}];
    let tags = [], dead = false, start = 0, loadsOk = true;
    for (let i = 0; i < ops.length; i++) {
        const p = ops[i], op = body[p], a = body[p + 1];
        if (op >= BLOCK && op <= IF) {
            if (!dead && op === IF) tags.pop();
            frames.push({base: tags.length, value: a !== VOID, deadEntry: dead});
            start = i + 1;
            continue;
        }
        if (op === ELSE || op === END) {
            const frame = op === ELSE ? frames.at(-1) : frames.pop();
            if (!frame || !frames.length) return null;
            tags.length = frame.base;
            if (op === END && frame.value) tags.push(null);
            dead = frame.deadEntry;
            if (tags.length === frames.at(-1).base) start = i + 1;
            continue;
        }
        if (dead) continue;
        switch (op) {
        case I32_CONST: case LOCAL_GET: tags.push(null); break;
        case LOCAL_SET:
            tags.pop();
            if (tags.length === frames.at(-1).base) statements.push({start, set: i, local: a});
            break;
        case DROP: case BR_IF: tags.pop(); break;
        case BR: case RETURN: case UNREACHABLE: dead = true; break;
        case CALL:
            for (let n = arity(a); n > 0; n--) tags.pop();
            for (let n = arity.results?.(a) ?? 1; n > 0; n--) tags.push(null);
            if (!storeless(a)) loadsOk = false;
            break;
        case I32_LOAD: case I32_LOAD16_U: tags.pop(); tags.push(null); break;
        case I32_STORE: case I32_STORE16: {
            tags.pop();
            const buffer = tags.pop();
            if (buffer === null || buffer === undefined) loadsOk = false; else stored.add(buffer);
            break;
        }
        case CHECKED_ADDRESS: case UNCHECKED_ADDRESS: tags.push(a); break;
        case LITERAL_STORES: stored.add(a); break;
        // A local array's address: no buffer's (a store through it clears loadsOk, as an unknown address does).
        case ARRAY_ADDRESS: tags.push(null); break;
        case ARRAY_ZERO: loadsOk = false; break;
        case I32_EQZ: break;
        default:
            if (!((op >= I32_EQ && op <= I32_GE_U) || (op >= I32_ADD && op <= I32_SHR_U))) return null;
            tags.pop(); tags.pop(); tags.push(null);
        }
        if (!dead && tags.length === frames.at(-1).base) start = i + 1;
    }
    // Op index of the else or end that closes the region holding ops[i].
    const regionEnd = i => {
        for (let j = i + 1, level = 0; j < ops.length; j++) {
            const op = body[ops[j]];
            if (op >= BLOCK && op <= IF) level++;
            else if (op === END) { if (level-- === 0) return j; }
            else if (op === ELSE && level === 0) return j;
        }
        return ops.length;
    };
    const moved = new Set(), hoisted = new Set(), loaded = new Set();
    const invariant = local => local !== k && (!writes.has(local) || moved.has(local));
    for (let changed = true; changed;) {
        changed = false;
        for (let n = 0; n < statements.length; n++) {
            if (hoisted.has(n)) continue;
            const {start, set, local: x} = statements[n];
            if (x === k || writes.get(x) !== 1 || readOutside(x)) continue;
            const end = regionEnd(set);
            if ((readsOf.get(x) ?? []).some(q => q <= set || q >= end)) continue;
            let ok = start < set;
            const buffers = [];
            for (let i = start; i < set && ok; i++) {
                const p = ops[i], op = body[p], a = body[p + 1], prev = i > start ? ops[i - 1] : -1;
                if (op === I32_CONST) continue;
                if (op === LOCAL_GET) ok = invariant(a);
                else if (op === UNCHECKED_ADDRESS) {
                    ok = unchecked.has(p) && invariant(a) && invariant(body[p + 2]) && loadsOk && !stored.has(a);
                    buffers.push(a);
                } else if (op === I32_LOAD16_U) ok = prev >= 0 && body[prev] === UNCHECKED_ADDRESS;
                else if (op === I32_LOAD) ok = body[p + 2] === 0 && prev >= 0 && body[prev] === LOCAL_GET && invariant(body[prev + 1]);
                else if (dividing(op)) ok = prev >= 0 && body[prev] === I32_CONST && body[prev + 1] !== 0 && body[prev + 1] !== -1;
                else ok = op === I32_EQZ || (op >= I32_EQ && op <= I32_GE_U) || (op >= I32_ADD && op <= I32_SHR_U);
            }
            if (!ok) continue;
            hoisted.add(n);
            moved.add(x);
            for (const b of buffers) loaded.add(b);
            changed = true;
        }
    }
    // Copies (single-op statements) stay in the loop; one is needed before it only when a moved
    // statement that is not itself a copy reads its local, directly or through another copy.
    const isCopy = n => statements[n].set === statements[n].start + 1;
    const needed = new Set();
    for (const n of hoisted) if (!isCopy(n)) {
        for (let i = statements[n].start; i < statements[n].set; i++) {
            const p = ops[i], op = body[p];
            if (op === LOCAL_GET) needed.add(body[p + 1]);
            if (op === UNCHECKED_ADDRESS) needed.add(body[p + 2]);
        }
    }
    for (let grew = true; grew;) {
        grew = false;
        for (const n of hoisted) if (isCopy(n) && needed.has(statements[n].local) && body[ops[statements[n].start]] === LOCAL_GET &&
            !needed.has(body[ops[statements[n].start] + 1])) { needed.add(body[ops[statements[n].start] + 1]); grew = true; }
    }
    if (![...hoisted].some(n => !isCopy(n))) return null;
    // In body order: a moved statement only reads locals written before it by moved statements.
    // A needed copy whose local only moved statements read moves too; otherwise it is duplicated.
    const take = new Set(), copy = new Set();
    for (const n of hoisted) if (!isCopy(n)) for (let i = statements[n].start; i <= statements[n].set; i++) take.add(i);
    for (const n of [...hoisted].filter(isCopy).sort((a, b) => b - a)) {
        const {start, set, local} = statements[n];
        if (!needed.has(local)) continue;
        const target = (readsOf.get(local) ?? []).every(q => take.has(q)) ? take : copy;
        for (let i = start; i <= set; i++) target.add(i);
    }
    const pre = [], out = [];
    for (let i = 0; i < ops.length; i++) {
        for (let j = ops[i]; j < opNext(body, ops[i]); j++) {
            if (take.has(i) || copy.has(i)) pre.push(body[j]);
            if (!take.has(i)) out.push(body[j]);
        }
    }
    const aliasTerms = [];
    for (const r of loaded) for (const s of stored) aliasTerms.push(LOCAL_GET, s, LOCAL_GET, r, I32_EQ, BR_IF, 0);
    return {pre, body: out, aliasTerms};
}

// the hoist pass, second step: a maximal subexpression of the fast copy that is pure, cannot trap
// and reads only constants, locals the loop does not write and capacities moves into a fresh
// local computed after the guard, when it does at least two operations' work (a division counts
// twice). Loads stay where they are: only hoistInvariants proves them unaliased. Consecutive
// moved comparisons that each feed a br_if to the same label become one sum and one br_if,
// since each comparison is 0 or 1 (an inner loop's guard, whose terms depend on its bound only).
// In the ray tracer: y / 16 in the checker, and the guard of InShadow's sphere loop.
function hoistSubexpressions(body, k, arity, fresh) {
    const ops = [];
    for (let p = 0; p < body.length; p = opNext(body, p)) ops.push(p);
    const written = new Set();
    for (const p of ops) if (body[p] === LOCAL_SET) written.add(body[p + 1]);
    const invariant = local => local !== k && !written.has(local);
    const isCompare = op => op === I32_EQZ || (op >= I32_EQ && op <= I32_GE_U);
    // A slot is {inv, start, end, work}: the ops start..end compute it.
    const ranges = [], frames = [{base: 0, value: false, deadEntry: false}];
    let slots = [], dead = false;
    const opaque = {inv: false};
    // A comparison feeding a br_if moves at one operation's work, so that it can join a run.
    const flush = (xs, branch) => { for (const x of xs) if (x.inv && (x.work >= 2 || (branch && x.work >= 1 && isCompare(body[ops[x.end]])))) ranges.push(x); };
    const combine = (i, count, ok, work = 1) => {
        const xs = count ? slots.splice(Math.max(0, slots.length - count), count) : [];
        if (xs.length === count && ok && xs.every(x => x.inv))
            slots.push({inv: true, start: count ? xs[0].start : i, end: i, work: work + xs.reduce((t, x) => t + x.work, 0)});
        else { flush(xs); slots.push(opaque); }
    };
    const consume = (count, branch) => flush(slots.splice(Math.max(0, slots.length - count), count), branch);
    for (let i = 0; i < ops.length; i++) {
        const p = ops[i], op = body[p], a = body[p + 1];
        if (op >= BLOCK && op <= IF) {
            if (!dead && op === IF) consume(1);
            frames.push({base: slots.length, value: a !== VOID, deadEntry: dead});
            continue;
        }
        if (op === ELSE || op === END) {
            const frame = op === ELSE ? frames.at(-1) : frames.pop();
            if (!frame || !frames.length) return null;
            consume(slots.length - frame.base);
            if (op === END && frame.value) slots.push(opaque);
            dead = frame.deadEntry;
            continue;
        }
        if (dead) continue;
        switch (op) {
        case I32_CONST: slots.push({inv: true, start: i, end: i, work: 0}); break;
        case LOCAL_GET: slots.push(invariant(a) ? {inv: true, start: i, end: i, work: 0} : opaque); break;
        case LOCAL_SET: case DROP: consume(1); break;
        case BR_IF: consume(1, true); break;
        case BR: case RETURN: case UNREACHABLE: consume(slots.length - frames.at(-1).base); dead = true; break;
        case CALL:
            consume(arity(a));
            for (let n = arity.results?.(a) ?? 1; n > 0; n--) slots.push(opaque);
            break;
        case I32_LOAD: {
            const x = slots.at(-1);
            combine(i, 1, body[p + 2] === 0 && x?.inv && x.start === x.end && body[ops[x.start]] === LOCAL_GET);
            break;
        }
        case I32_LOAD16_U: combine(i, 1, false); break;
        case I32_STORE: case I32_STORE16: consume(2); break;
        case CHECKED_ADDRESS: case UNCHECKED_ADDRESS: case ARRAY_ADDRESS: slots.push(opaque); break;
        case LITERAL_STORES: case ARRAY_ZERO: break;
        case I32_EQZ: combine(i, 1, true); break;
        default: {
            if (!((op >= I32_EQ && op <= I32_GE_U) || (op >= I32_ADD && op <= I32_SHR_U))) return null;
            if (dividing(op)) {
                const d = slots.at(-1);
                const constant = d?.inv && d.start === d.end && body[ops[d.start]] === I32_CONST ? body[ops[d.start] + 1] : undefined;
                combine(i, 2, constant !== undefined && constant !== 0 && constant !== -1, 2);
            } else combine(i, 2, true);
        }
        }
    }
    if (!ranges.length) return null;
    ranges.sort((x, y) => x.start - y.start);
    // Merge runs of moved comparisons, each followed by br_if to the same label.
    const groups = [];
    for (const r of ranges) {
        const last = groups.at(-1), next = ops[r.end + 1];
        const branch = isCompare(body[ops[r.end]]) && next !== undefined && body[next] === BR_IF ? body[next + 1] : undefined;
        const prev = last?.at(-1);
        if (branch !== undefined && prev?.branch === branch && prev.end + 2 === r.start) last.push({...r, branch});
        else groups.push([{...r, branch}]);
    }
    const kept = groups.filter(g => g.length > 1 || g[0].work >= 2);
    if (!kept.length) return null;
    groups.length = 0;
    groups.push(...kept);
    const pre = [], out = [], replace = new Map();
    const cells = (from, to) => { const xs = []; for (let i = from; i <= to; i++) for (let j = ops[i]; j < opNext(body, ops[i]); j++) xs.push(body[j]); return xs; };
    for (const g of groups) {
        const t = fresh();
        g.forEach((r, n) => { pre.push(...cells(r.start, r.end)); if (n) pre.push(I32_ADD); });
        pre.push(LOCAL_SET, t);
        // The first member's ops become `get t`; later members and their br_if disappear.
        replace.set(g[0].start, {end: g[0].end, cells: [LOCAL_GET, t]});
        for (const r of g.slice(1)) replace.set(r.start - 1, {end: r.end, cells: []});
    }
    for (let i = 0; i < ops.length; i++) {
        const r = replace.get(i);
        if (r) { out.push(...r.cells); i = r.end; continue; }
        for (let j = ops[i]; j < opNext(body, ops[i]); j++) out.push(body[j]);
    }
    return {pre, body: out};
}

// rv32/passes/version-loops.js
// The version pass, with induction variables.

// the version pass: a rotated counted loop (rotateLoops)
//   block  get k (const n | get N) lt_s eqz br_if 0  loop  B  get k (n | N) lt_s br_if 0  end  end
// whose body B ends in k = k + s (1 <= s <= 64), with no other write of k or N in the loop, is
// emitted twice. Checked accesses r[i] in B whose index is a*k + b, M + a*k + b with M unwritten
// in the loop, or a constant, on an unwritten parameter r, are proved in range for every
// iteration by one guard before the loop: k ranges over [k0, N - 1], so the largest index is
// a*(N - 1) + b (+ M). If the guard holds, a copy of the loop runs with those accesses unchecked
// (UNCHECKED_ADDRESS r t j: the address of r[t + j]); otherwise the original loop runs. An access that the
// fast copy leaves unchecked would not trap in the original either, so traps, their position
// and every store before them are unchanged. Affine locals are i = a*k + b written once in B
// and read only after that write in its own region. The guard keeps every term below 2^31:
// N <= 2^20, a <= 1024 and 0 <= b <= 2^20.
const VERSION_LIMITS = Object.freeze({coefficient: 1024, offset: 1 << 20, bound: 1 << 20, bodyCells: 2000});
function versionLoops(code, params, hoist, induction) {
    for (let at = 0; at < code.length; at = opNext(code, at)) if (!(CELLS[code[at]] >= 0)) return null;
    // the hoist pass: where each local is read, so a moved statement's local can be checked for
    // reads outside its loop (hoistInvariants).
    const readsAt = new Map();
    if (hoist || induction) for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        const locals = op === LOCAL_GET || op === LITERAL_STORES ? [code[at + 1]] : op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS ? [code[at + 1], code[at + 2]] : [];
        for (const x of locals) { if (!readsAt.has(x)) readsAt.set(x, []); readsAt.get(x).push(at); }
    }
    // A single-use index local can absorb the constant of its index into the access.
    const reads = new Map();
    const read = local => reads.set(local, (reads.get(local) ?? 0) + 1);
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (op === LOCAL_GET || op === LITERAL_STORES) read(code[at + 1]);
        else if (op === CHECKED_ADDRESS) { read(code[at + 1]); read(code[at + 2]); }
    }
    let changed = false;
    const out = transform(code);
    return changed ? out : null;

    function transform(src) {
        const out = [];
        let prev = -1, prev2 = -1;
        for (let at = 0; at < src.length;) {
            // k0 is a known non-negative constant when `const c; set k` precedes the loop.
            const k0Known = prev2 >= 0 && src[prev2] === I32_CONST && src[prev2 + 1] >= 0 && src[prev] === LOCAL_SET && src[prev + 1] === src[at + 3];
            const v = version(src, at, k0Known, k0Known ? src[prev2 + 1] : undefined);
            if (v) {
                out.push(...v.cells);
                changed = true;
                prev = prev2 = -1;
                at = v.end;
                continue;
            }
            const n = opNext(src, at);
            for (let j = at; j < n; j++) out.push(src[j]);
            prev2 = prev; prev = at;
            at = n;
        }
        return out;
    }

    function version(src, at, k0Known, k0) {
        if (src[at] !== BLOCK || src[at + 1] !== VOID || src[at + 2] !== LOCAL_GET || src[at + 6] !== I32_LT_S || src[at + 7] !== I32_EQZ ||
            src[at + 8] !== BR_IF || src[at + 9] !== 0 || src[at + 10] !== LOOP || src[at + 11] !== VOID) return null;
        const k = src[at + 3], boundOp = src[at + 4], bound = src[at + 5];
        if (boundOp !== I32_CONST && boundOp !== LOCAL_GET) return null;
        const loopEnd = opClose(src, at + 10), blockEnd = opClose(src, at);
        if (loopEnd < 0 || blockEnd !== loopEnd + 1) return null;
        const cond = src.slice(at + 2, at + 7);
        if (src.slice(loopEnd - 7, loopEnd).join() !== [...cond, BR_IF, 0].join()) return null;
        const bodyStart = at + 12, bodyEnd = loopEnd - 7;
        if (bodyEnd - bodyStart > VERSION_LIMITS.bodyCells) return null;
        const inc = bodyEnd - 7;
        if (inc < bodyStart || src[inc] !== LOCAL_GET || src[inc + 1] !== k || src[inc + 2] !== I32_CONST || src[inc + 4] !== I32_ADD ||
            src[inc + 5] !== LOCAL_SET || src[inc + 6] !== k || !(src[inc + 3] >= 1 && src[inc + 3] <= 64)) return null;
        if (boundOp === I32_CONST && !(bound >= 1 && bound <= VERSION_LIMITS.bound)) return null;
        const ops = [], writes = new Map();
        for (let p = bodyStart; p < bodyEnd; p = opNext(src, p)) {
            ops.push({op: src[p], at: p, a: src[p + 1], b: src[p + 2]});
            if (src[p] === LOCAL_SET) writes.set(src[p + 1], (writes.get(src[p + 1]) ?? 0) + 1);
        }
        if (writes.get(k) !== 1 || (boundOp === LOCAL_GET && writes.has(bound))) return null;
        const o = j => ops[j] ?? {};
        // End of the region that opens around ops[i]: the closing end or else of its construct.
        const regionEnd = i => {
            for (let j = i + 1, level = 0; j < ops.length; j++) {
                const op = ops[j].op;
                if (op >= BLOCK && op <= IF) level++;
                else if (op === END) { if (level-- === 0) return j; }
                else if (op === ELSE && level === 0) return j;
            }
            return ops.length;
        };
        const affine = new Map();
        const formOf = (local, i) => {
            if (local === k) return {a: 1, b: 0};
            const f = affine.get(local);
            return f && f.def < i && i < f.end ? f : null;
        };
        const invariant = local => local !== k && !writes.has(local);
        // Affine form of the value that ops[i] consumes, from the operations just before it.
        function expression(i) {
            const scaled = (f, m, c) => f && {a: f.a * m, b: f.b * m + c};
            if (o(i - 1).op === I32_ADD && o(i - 2).op === I32_CONST && o(i - 3).op === I32_MUL && o(i - 4).op === I32_CONST && o(i - 5).op === LOCAL_GET)
                return scaled(formOf(o(i - 5).a, i), o(i - 4).a, o(i - 2).a);
            if (o(i - 1).op === I32_ADD && o(i - 2).op === I32_MUL && o(i - 3).op === I32_CONST && o(i - 4).op === LOCAL_GET && o(i - 5).op === I32_CONST)
                return scaled(formOf(o(i - 4).a, i), o(i - 3).a, o(i - 5).a);
            if (o(i - 1).op === I32_MUL && o(i - 2).op === I32_CONST && o(i - 3).op === LOCAL_GET) return scaled(formOf(o(i - 3).a, i), o(i - 2).a, 0);
            if (o(i - 1).op === I32_ADD && o(i - 2).op === I32_CONST && o(i - 3).op === LOCAL_GET) return scaled(formOf(o(i - 3).a, i), 1, o(i - 2).a);
            if (o(i - 1).op === I32_ADD && o(i - 2).op === LOCAL_GET && o(i - 3).op === I32_CONST) return scaled(formOf(o(i - 2).a, i), 1, o(i - 3).a);
            if (o(i - 1).op === LOCAL_GET) return scaled(formOf(o(i - 1).a, i), 1, 0);
            return null;
        }
        const inRange = f => f && f.a >= 0 && f.a <= VERSION_LIMITS.coefficient && f.b >= 0 && f.b <= VERSION_LIMITS.offset;
        const eligible = new Map(); // f1 offset -> {fold: offsets of the const and add, j}
        const limits = new Map();   // receiver -> Map(key "a" or "a:M" -> {a, b, M})
        const note = (r, f, M) => {
            if (!limits.has(r)) limits.set(r, new Map());
            const key = f.a + (M === undefined ? "" : ":" + M), m = limits.get(r);
            if (!m.has(key) || m.get(key).b < f.b) m.set(key, {a: f.a, b: f.b, M});
        };
        for (let i = 0; i < ops.length; i++) {
            const {op, a, b} = ops[i];
            if (op === LOCAL_SET && a !== k && writes.get(a) === 1) {
                const f = expression(i);
                if (inRange(f)) affine.set(a, {...f, def: i, end: regionEnd(i)});
            }
            if (op !== CHECKED_ADDRESS || a >= params || o(i - 1).op !== LOCAL_SET || o(i - 1).a !== b) continue;
            const e = i - 1, single = reads.get(b) === 1 && writes.get(b) === 1;
            let f = null, M, fold;
            if (o(e - 1).op === I32_CONST && o(e - 1).a >= 0 && o(e - 1).a <= VERSION_LIMITS.offset) f = {a: 0, b: o(e - 1).a};
            else if (inRange(f = expression(e))) {
                // [x, const j, add] or [const j, x, add] before set t: j moves into the access.
                if (single && o(e - 1).op === I32_ADD && (o(e - 2).op === I32_CONST || o(e - 3).op === I32_CONST) &&
                    (o(e - 2).op === I32_CONST ? o(e - 3).op === LOCAL_GET : o(e - 2).op === LOCAL_GET)) {
                    const c = o(e - 2).op === I32_CONST ? e - 2 : e - 3;
                    fold = {drop: [ops[c].at, ops[e - 1].at], j: ops[c].a};
                }
            } else {
                f = null;
                const sum = (x, y) => o(e - 1).op === I32_ADD && o(e - 2).op === LOCAL_GET && o(e - 3).op === LOCAL_GET &&
                    invariant(o(e - x).a) && inRange(formOf(o(e - y).a, e)) ? [o(e - x).a, formOf(o(e - y).a, e)] : null;
                const pair = sum(3, 2) ?? sum(2, 3);
                if (pair) { M = pair[0]; f = {a: pair[1].a, b: pair[1].b}; }
                else if (o(e - 1).op === LOCAL_GET && invariant(o(e - 1).a)) { M = o(e - 1).a; f = {a: 0, b: 0}; }
                else if (o(e - 1).op === I32_ADD && o(e - 2).op === I32_CONST && o(e - 3).op === LOCAL_GET && invariant(o(e - 3).a) && inRange({a: 0, b: o(e - 2).a})) {
                    M = o(e - 3).a; f = {a: 0, b: o(e - 2).a};
                    if (single) fold = {drop: [ops[e - 2].at, ops[e - 1].at], j: o(e - 2).a};
                }
            }
            if (!f) continue;
            note(a, f, M);
            eligible.set(ops[i].at, fold ?? {drop: [], j: 0});
        }
        if (!eligible.size) return null;
        // Guard: each term pushes a failure condition and leaves the guard block with br_if 0.
        const terms = [];
        const cap = r => [LOCAL_GET, r, I32_LOAD, 2, 0];
        const largest = (a, b) => boundOp === I32_CONST ? [I32_CONST, a * (bound - 1) + b] : [LOCAL_GET, bound, I32_CONST, a, I32_MUL, I32_CONST, b - a, I32_ADD];
        if (!k0Known) terms.push(LOCAL_GET, k, I32_CONST, 0, I32_LT_S, BR_IF, 0);
        if (boundOp === LOCAL_GET) terms.push(LOCAL_GET, bound, I32_CONST, VERSION_LIMITS.bound, I32_GT_S, BR_IF, 0);
        for (const [r, m] of limits) {
            const plain = [...m.values()].filter(x => x.M === undefined), shifted = [...m.values()].filter(x => x.M !== undefined);
            if (boundOp === I32_CONST && plain.length) {
                const top = Math.max(...plain.map(x => x.a * (bound - 1) + x.b));
                terms.push(I32_CONST, top, ...cap(r), I32_GE_S, BR_IF, 0);
            } else for (const x of plain) terms.push(...largest(x.a, x.b), ...cap(r), I32_GE_S, BR_IF, 0);
            if (shifted.length) terms.push(...cap(r), I32_CONST, 0, I32_LT_S, BR_IF, 0);
            for (const M of new Set(shifted.map(x => x.M))) terms.push(LOCAL_GET, M, I32_CONST, 0, I32_LT_S, BR_IF, 0);
            for (const x of shifted) terms.push(...largest(x.a, x.b), ...cap(r), LOCAL_GET, x.M, I32_SUB, I32_GE_S, BR_IF, 0);
        }
        // The fast body: unchecked accesses, and branches that leave the loop one level further
        // out (the loop now sits inside the guard block).
        // the induction pass: an affine local i = a*k + b whose definition multiplies, runs on every
        // iteration and is not absorbed into an access, in a loop whose counter starts at a known
        // constant k0, becomes an induction variable: set to a*k0 + b before the loop, stepped
        // by a*s beside k = k + s, its definition removed. Every read of i follows its one write
        // in the body's top region and lies inside this loop (all of the function's reads of i
        // are here), so each read still sees a*k + b and none sees the step past the last. A
        // pointer home over i then advances by one addition (InShadow's 21 + 4 * sphere), and
        // when the pointer is i's only reader the planner drops i's own steps.
        const reduced = [], skip = new Set(), folded = new Set([...eligible.values()].flatMap(x => x.drop));
        if (induction && k0 !== undefined) for (const [local, f] of affine) {
            if (f.end !== ops.length) continue;
            const readsHere = [];
            for (let i = 0; i < ops.length; i++) {
                const {op, a, b} = ops[i];
                if (((op === LOCAL_GET || op === LITERAL_STORES) && a === local) || ((op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) && (a === local || b === local))) readsHere.push(i);
            }
            if (!readsHere.length || readsHere.some(i => i <= f.def) || (readsAt.get(local)?.length ?? -1) !== readsHere.length) continue;
            let start = f.def, net = 0;
            for (let j = f.def - 1; j >= 0; j--) {
                const op = ops[j].op;
                if (op === LOCAL_GET || op === I32_CONST) net++;
                else if (op === I32_ADD || op === I32_MUL) net--;
                else break;
                if (net === 1) { start = j; break; }
            }
            if (start === f.def) continue;
            let absorbed = false, multiplies = false;
            for (let j = start; j <= f.def; j++) { if (folded.has(ops[j].at)) absorbed = true; if (ops[j].op === I32_MUL) multiplies = true; }
            const i32 = x => Number.isInteger(x) && x >= -2147483648 && x <= 2147483647;
            if (absorbed || !multiplies || !i32(f.a * k0 + f.b) || !i32(f.a * src[inc + 3])) continue;
            for (let j = start; j <= f.def; j++) skip.add(ops[j].at);
            reduced.push({local, a: f.a, b: f.b});
        }
        let fast = [];
        const drop = new Set([...eligible.values()].flatMap(x => x.drop)), unchecked = new Set();
        for (const p of skip) drop.add(p);
        for (let p = bodyStart, depth = 0; p < bodyEnd; p = opNext(src, p)) {
            const op = src[p];
            if (p === inc) for (const r of reduced) fast.push(LOCAL_GET, r.local, I32_CONST, r.a * src[inc + 3], I32_ADD, LOCAL_SET, r.local);
            if (drop.has(p)) continue;
            if (op === CHECKED_ADDRESS && eligible.has(p)) { unchecked.add(fast.length); fast.push(UNCHECKED_ADDRESS, src[p + 1], src[p + 2], eligible.get(p).j); continue; }
            if ((op === BR || op === BR_IF) && src[p + 1] > depth) { fast.push(op, src[p + 1] + 1); continue; }
            if (op >= BLOCK && op <= IF) depth++;
            else if (op === END) depth--;
            for (let j = p; j < opNext(src, p); j++) fast.push(src[j]);
        }
        // the hoist pass, for loops at the function's top level (whose reads outside the loop are
        // all in code): invariant statements of the fast copy run once, after the guard.
        let moved = {pre: [], aliasTerms: []};
        if (hoist && src === code) {
            const outside = local => (readsAt.get(local) ?? []).some(p => p < at || p > blockEnd);
            const h = hoistInvariants(fast, unchecked, k, outside, hoist.storeless, hoist.arity);
            if (h) { fast = h.body; moved = h; }
        }
        // Then, once inner loops have their guards, invariant subexpressions (hoistSubexpressions).
        let inner = transform(fast), computed = [];
        if (hoist && src === code) {
            const h = hoistSubexpressions(inner, k, hoist.arity, hoist.fresh);
            if (h) { inner = h.body; computed = h.pre; }
        }
        const start = reduced.flatMap(r => [I32_CONST, r.a * k0 + r.b, LOCAL_SET, r.local]);
        const cells = [BLOCK, VOID, ...cond, I32_EQZ, BR_IF, 0,
            BLOCK, VOID, ...terms, ...moved.aliasTerms, ...moved.pre, ...computed, ...start,
            LOOP, VOID, ...inner, ...cond, BR_IF, 0, END,
            BR, 1,
            END,
            LOOP, VOID, ...src.slice(bodyStart, bodyEnd), ...cond, BR_IF, 0, END,
            END];
        return {cells, end: blockEnd + 1};
    }
}

// rv32/passes/split-locals.js
// The split pass.

// operandLocations.split: give every web of a local its own local id. A web starts at a write;
// every later occurrence inside the region that holds that write (a block, loop, if-arm or
// else-arm, or the body) belongs to it, because in structured code the write precedes them on
// every path through that region. An occurrence outside the current web's region starts a new
// web if it is a write; a read there makes the local unsplittable. Webs never read each other's
// writes, so the renaming is exact. Two inlined copies of one callee, or the two copies of a
// versioned loop, then have separate intervals for share.
function splitLocals(code, params, nlocals) {
    const uses = new Map(), path = [];
    let region = 0;
    const note = (cell, write) => {
        const id = code[cell];
        if (id < params) return;
        if (!uses.has(id)) uses.set(id, []);
        uses.get(id).push({cell, write, path: path.slice()});
    };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (!(CELLS[op] >= 0)) return null;
        if (op === ELSE) { path.pop(); path.push(region++); }
        else if (op === END) path.pop();
        if (op === LOCAL_GET || op === LITERAL_STORES) note(at + 1, false);
        else if (op === LOCAL_SET) note(at + 1, true);
        else if (op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) { note(at + 1, false); note(at + 2, false); }
        if (op >= BLOCK && op <= IF) path.push(region++);
    }
    const inside = (outer, inner) => outer.length <= inner.length && outer.every((x, i) => inner[i] === x);
    const out = code.slice();
    let fresh = params + nlocals;
    const origin = [];
    for (const [local, occurrences] of uses) {
        const webs = [];
        let current = null, splittable = true;
        for (const o of occurrences) {
            if (current && inside(current.path, o.path)) { current.cells.push(o.cell); continue; }
            if (!o.write) { splittable = false; break; }
            current = {path: o.path, cells: [o.cell]};
            webs.push(current);
        }
        if (!splittable || webs.length < 2) continue;
        for (const web of webs.slice(1)) {
            const id = fresh++;
            origin.push(local);
            for (const cell of web.cells) out[cell] = id;
        }
    }
    // origin[i] is the local that fresh local params + nlocals + i was split from.
    return fresh === params + nlocals ? null : {code: out, nlocals: fresh - params, origin};
}

// rv32/passes/loops-group.js
// The "loops" group (typed-rv32-loops.js): what "default" adds to "balanced", version with its options hoist and
// induction, and split. Loading this module installs them in the registry.

installPasses("loops", {
    version: {run(fn, ctx) {
        const hoist = ctx.passes.has("hoist") ?
            {storeless: ctx.storeless, arity: ctx.arity, fresh: () => fn.params.length + fn.nlocals++} : undefined;
        replaceTape(fn, versionLoops(fn.code, fn.params.length, hoist, ctx.passes.has("induction")));
    }},
    // A function's storeless answer is computed from its tape before any pass rewrites it.
    hoist: {startName: "storeless", start: (fn, ctx) => ctx.storeless(ctx.index)},
    induction: {},
    split: {run(fn, ctx) {
        const before = fn.params.length + fn.nlocals;
        const split = splitLocals(fn.code, fn.params.length, fn.nlocals);
        if (split) {
            fn.code = split.code;
            fn.nlocals = split.nlocals;
            // A web of an f32 local is an f32 local.
            if (fn.localTypes) {
                const types = fn.localTypes.slice(); // a library copy of the inline pass may share the array
                for (let i = 0; i < split.origin.length; i++)
                    types[before - fn.params.length + i] = types[split.origin[i] - fn.params.length] ?? "i32";
                fn.localTypes = types;
            }
            ctx.origin = local => local >= before ? split.origin[local - before] : local;
        }
    }},
});
// A marker for loaders that list what a realm holds (the trace-REPL workbench's module table).
globalThis.typedRv32Loops = {group: "loops"};
})();
