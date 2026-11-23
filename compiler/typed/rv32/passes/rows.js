// The rows pass.
import {opNext, CELLS, EFFECTS, STORES, BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, RETURN, UNREACHABLE, CALL, LOCAL_GET, LOCAL_SET,
    I32_CONST, I32_ADD, I32_SUB, I32_MUL, I32_SHL, I32_LOAD, I32_GE_U, CHECKED_ADDRESS, UNCHECKED_ADDRESS, LITERAL_STORES, F32_LOAD, F32_CONST, VOID,
    tapeRow} from "../encoding/tape.js";

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

export function groupRowReads(fn) {
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
