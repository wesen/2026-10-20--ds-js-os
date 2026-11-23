// The version pass, with induction variables.
import {opNext, CELLS, LOCAL_GET, LITERAL_STORES, CHECKED_ADDRESS, UNCHECKED_ADDRESS, I32_CONST, LOCAL_SET, BLOCK, VOID, I32_LT_S, I32_EQZ, BR_IF, LOOP, opClose, I32_ADD, IF, END, ELSE, I32_MUL, I32_LOAD, I32_GT_S, I32_GE_S, I32_SUB, BR} from "../encoding/tape.js";
import {hoistInvariants, hoistSubexpressions} from "./hoist.js";

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
export function versionLoops(code, params, hoist, induction) {
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
