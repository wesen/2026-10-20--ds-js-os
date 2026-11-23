// The coalesce pass.
import {opNext, CELLS, BLOCK, LOOP, IF, ELSE, END, BR, RETURN, UNREACHABLE, CALL, LOCAL_GET, LOCAL_SET, LITERAL_STORES,
    CHECKED_ADDRESS, UNCHECKED_ADDRESS, VOID, tapeRow} from "../encoding/tape.js";

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
export function coalesceCopies(fn, arity, origin) {
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
