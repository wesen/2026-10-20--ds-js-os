// The rows pass.
import {opNext, CELLS, EFFECTS, STORES, BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, RETURN, UNREACHABLE, CALL, LOCAL_GET, LOCAL_SET,
    I32_CONST, I32_ADD, I32_SHL, I32_LOAD, I32_GE_U, CHECKED_ADDRESS, F32_LOAD, VOID} from "../encoding/tape.js";

// rows (PICOCALC-CANDELA-KERNEL-CODEGEN): f32 reads of one buffer at constant distances from one index, as a kernel
// reads a row of vectors (`b.getF32(a)`, `b.getF32(a + 1)` ... ), share one range check and one address. Each
// `b.getF32(E)` is written `E; const 1; shl; const 1; add; set p; checked_address b p; f32.load 2 2` (unit 2E + 1 is
// checked, the load reads at b + 4 + 4E), with E a local L, `L + k` or a literal k. Reads of the same b and L inside
// one straight stretch of tape (no block, branch, call or store between them, and no write of b or L) form a group;
// a group of three or more becomes, where its first read's index began:
//     P = 2(L + kmin) + 1; trap unless P <u capacity(b); trap unless P + 2(kmax - kmin) <u capacity(b);
//     Q = b + 2P
// and each read k a load from Q at 2 + 4(k - kmin): one instruction for a homed Q. The two checks together are
// exact: P is below a capacity under 2^31, so P + 2d does not wrap and every unit from P to P + 2d is in range
// exactly when both are. A group of literal indices needs only the check of its largest and loads from b itself
// at 4 + 4k. A read that would trap traps at the group's start instead of at itself; nothing between them stores
// to memory, calls or branches, so the memory a trap leaves is the same.
// The pass runs only on f32 functions (integer programs keep their pinned images).
const MIN_GROUP = 3;
const BOUNDARY = new Set([BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, RETURN, UNREACHABLE, CALL]);

// The read whose index expression starts at `at`: {end, L, k, r} (L -1 for a literal index), or null.
function readAt(code, at) {
    let x = at, L = -1, k = 0;
    if (code[x] === LOCAL_GET) {
        L = code[x + 1]; x += 2;
        if (code[x] === I32_CONST && code[x + 2] === I32_ADD) { k = code[x + 1]; x += 3; }
    } else if (code[x] === I32_CONST) { k = code[x + 1]; x += 2; }
    else return null;
    if (!(code[x] === I32_CONST && code[x + 1] === 1 && code[x + 2] === I32_SHL && code[x + 3] === I32_CONST &&
        code[x + 4] === 1 && code[x + 5] === I32_ADD && code[x + 6] === LOCAL_SET && code[x + 8] === CHECKED_ADDRESS &&
        code[x + 10] === code[x + 7] && code[x + 11] === F32_LOAD && code[x + 12] === 2 && code[x + 13] === 2)) return null;
    if (k < 0 || k > 500) return null;
    return {start: at, end: x + 14, L, k, r: code[x + 9]};
}

export function groupRowReads(fn) {
    const code = fn.code;
    const groups = [], open = new Map();
    const close = key => { const g = open.get(key); if (g) { open.delete(key); if (g.reads.length >= MIN_GROUP) groups.push(g); } };
    const closeAll = () => { for (const key of [...open.keys()]) close(key); };
    for (let at = 0; at < code.length;) {
        const op = code[at];
        if (!(CELLS[op] >= 0)) return null;
        const read = readAt(code, at);
        if (read) {
            const key = read.r + ":" + read.L;
            if (!open.has(key)) open.set(key, {r: read.r, L: read.L, reads: []});
            open.get(key).reads.push(read);
            at = read.end;
            continue;
        }
        if (BOUNDARY.has(op) || (EFFECTS[op] & STORES)) closeAll();
        else if (op === LOCAL_SET) for (const [key, g] of open) if (g.r === code[at + 1] || g.L === code[at + 1]) close(key);
        at = opNext(code, at);
    }
    closeAll();
    const usable = groups.filter(g => {
        const ks = g.reads.map(x => x.k);
        return Math.max(...ks) - Math.min(...ks) <= 500;
    });
    if (!usable.length) return null;
    // Rewrite: a header before each group's first read, a load from the group's base for each read.
    let locals = fn.params.length + fn.nlocals;
    const header = new Map(), replace = new Map();
    for (const g of usable) {
        const ks = g.reads.map(x => x.k), kmin = Math.min(...ks), kmax = Math.max(...ks);
        const check = position => [...position, LOCAL_GET, g.r, I32_LOAD, 2, 0, I32_GE_U, IF, VOID, UNREACHABLE, END];
        if (g.L < 0) {
            header.set(g.reads[0].start, check([I32_CONST, 2 * kmax + 1]));
            for (const x of g.reads) replace.set(x.start, {end: x.end, cells: [LOCAL_GET, g.r, F32_LOAD, 2, 4 + 4 * x.k]});
            continue;
        }
        const P = locals++, Q = locals++;
        const cells = [LOCAL_GET, g.L, ...(kmin ? [I32_CONST, kmin, I32_ADD] : []), I32_CONST, 1, I32_SHL, I32_CONST, 1, I32_ADD,
            LOCAL_SET, P, ...check([LOCAL_GET, P])];
        if (kmax > kmin) cells.push(...check([LOCAL_GET, P, I32_CONST, 2 * (kmax - kmin), I32_ADD]));
        cells.push(LOCAL_GET, g.r, LOCAL_GET, P, I32_CONST, 1, I32_SHL, I32_ADD, LOCAL_SET, Q);
        header.set(g.reads[0].start, cells);
        for (const x of g.reads) replace.set(x.start, {end: x.end, cells: [LOCAL_GET, Q, F32_LOAD, 2, 2 + 4 * (x.k - kmin)]});
    }
    const out = [];
    for (let at = 0; at < code.length;) {
        const h = header.get(at);
        if (h) out.push(...h);
        const r = replace.get(at);
        if (r) { out.push(...r.cells); at = r.end; continue; }
        const next = opNext(code, at);
        for (let k = at; k < next; k++) out.push(code[k]);
        at = next;
    }
    const added = locals - fn.params.length - fn.nlocals;
    const localTypes = fn.localTypes ? [...fn.localTypes] : [];
    for (let i = localTypes.length; i < locals - fn.params.length; i++) localTypes[i] ??= "i32";
    return {code: out, nlocals: fn.nlocals + added, localTypes: fn.localTypes || added ? localTypes : undefined, groups: usable.length};
}
