// The hoist option of the version pass: loop invariants and subexpressions into the guard block.
import {opNext, LOCAL_SET, LOCAL_GET, LITERAL_STORES, CHECKED_ADDRESS, UNCHECKED_ADDRESS, BLOCK, IF, I32, VOID, ELSE, END, I32_CONST, DROP, BR_IF, BR, RETURN, UNREACHABLE, CALL, I32_LOAD, I32_LOAD16_U, I32_STORE, I32_STORE16, I32_EQZ, I32_EQ, I32_GE_U, I32_ADD, I32_SHR_U, I32_DIV_S, I32_REM_S, I32_DIV_U, I32_REM_U} from "../encoding/tape.js";

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
export function hoistInvariants(body, unchecked, k, readOutside, storeless, arity) {
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
export function hoistSubexpressions(body, k, arity, fresh) {
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
        case CHECKED_ADDRESS: case UNCHECKED_ADDRESS: slots.push(opaque); break;
        case LITERAL_STORES: break;
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

