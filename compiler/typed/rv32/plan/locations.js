// planLocations: operand homes, pointer groups and pointer-only skips.
import {A0, X, inOwnRegister} from "../encoding/registers.js";
import {constantForm} from "../encoding/selection.js";
import {CHECKED_ADDRESS, UNCHECKED_ADDRESS, CELLS, LOCAL_GET, LITERAL_STORES, LOCAL_SET, I32_ADD, I32_CONST, F32_CONST, CALL, EFFECTS, STORES, BLOCK, IF, LOOP, END, RETURN, opNext} from "../encoding/tape.js";
import {floatingFunction, keyClass, planSavedHomes} from "./saved-homes.js";

// Assign permanent homes only in framed scalar functions with a checked access.
export function planLocations(fn, options, inlineCall) {
    const tape = fn.code;
    // Forwarding and capacity reuse need a checked access; saved homes apply to any framed function.
    if (!options.saved && !tape.includes(CHECKED_ADDRESS) && !tape.includes(UNCHECKED_ADDRESS)) return null;
    const reads = new Map(), writes = new Set(), scores = new Map();
    let receiver, straight = true, pure = true, leaf = true, loops = 0, ifs = 0, guarded = false;
    // callFree: the offsets of the calls a return does not follow at once (saved-homes.js).
    const calls = [];
    // Estimated executions per invocation: four inside a loop. Saved homes cost a fixed
    // save and restore per call, so their estimate also halves under each enclosing if:
    // a value used only on a rarely taken path should stay in its slot.
    // nested: four times per enclosing loop level (at most three) instead of four for any loop.
    function weightNow(scale = 1) {
        const loopWeight = options.nested ? 4 ** Math.min(loops, 3) : loops ? 4 : 1;
        return loopWeight * (options.saved ? scale / (1 << Math.min(ifs, 3)) : 1);
    }
    function weigh(local, scale = 1) {
        scores.set(local, (scores.get(local) ?? 0) + weightNow(scale));
    }
    // pointers: forwarded accesses r[L + k], every write of a local (with its increment when
    // it is L = L + c), and locals read before any write in tape order.
    const pointerAccesses = [], writesOf = new Map(), readEarly = new Set();
    // capacities: each checked access to buffer local b scores b's capacity, key -1 - b.
    const capacityUses = new Map();
    function read(local) {
        reads.set(local, (reads.get(local) ?? 0) + 1);
        weigh(local);
    }
    // share: first and last tape offset of each local, whether its first occurrence is a
    // read, and every loop's extent, for the live intervals planSavedHomes compares.
    const first = new Map(), last = new Map(), readFirst = new Set(), loopSpans = [], loopStarts = [];
    function occur(local, offset, isRead) {
        if (!first.has(local)) {
            first.set(local, offset);
            if (isRead) readFirst.add(local);
        }
        last.set(local, offset);
    }
    const blocks = [];
    // A checked address whose index local was set by the preceding operation; the
    // forwarding decision needs the final read count, so it is resolved after the walk.
    const candidates = [];
    let prevOpcode = -1, prevOffset = -1, prevA = -1, prev2Opcode = -1, prev2Offset = -1, prev2A = -1;
    let prev3Opcode = -1, prev3A = -1, prev4Opcode = -1, prev4A = -1;
    for (let at = 0; at < tape.length;) {
        const offset = at, opcode = tape[at++];
        const cells = CELLS[opcode];
        // An opcode the planner does not know gets no plan; the emitter reports it.
        if (cells < 0) return null;
        const a = cells > 0 ? tape[at] : undefined, b = cells > 1 ? tape[at + 1] : undefined;
        at += cells;
        if (at > tape.length) throw new Error("truncated Typed inspection operation");
        if (options.pointers) {
            if ((opcode === LOCAL_GET || opcode === LITERAL_STORES) && !writes.has(a)) readEarly.add(a);
            if (opcode === CHECKED_ADDRESS || opcode === UNCHECKED_ADDRESS) for (const x of [a, b]) if (!writes.has(x)) readEarly.add(x);
            if (opcode === LOCAL_SET) {
                // L = L + c or L = c + L: the three preceding operations.
                let inc;
                if (prevOpcode === I32_ADD) {
                    if (prev2Opcode === I32_CONST && prev3Opcode === LOCAL_GET && prev3A === a) inc = prev2A;
                    else if (prev2Opcode === LOCAL_GET && prev2A === a && prev3Opcode === I32_CONST) inc = prev3A;
                }
                if (!writesOf.has(a)) writesOf.set(a, []);
                writesOf.get(a).push({at: offset, w: weightNow(), inc, depth: loops});
            }
            if ((opcode === CHECKED_ADDRESS || opcode === UNCHECKED_ADDRESS) && prevOpcode === LOCAL_SET && prevA === b) {
                // r[L], r[L + k], r[k + L] and r[L + M] for locals L and M, the index expression
                // being the operations before the local.set.
                let L, M, k = 0;
                if (prev2Opcode === LOCAL_GET) L = prev2A;
                else if (prev2Opcode === I32_ADD) {
                    if (prev3Opcode === I32_CONST && prev4Opcode === LOCAL_GET) { L = prev4A; k = prev3A; }
                    else if (prev3Opcode === LOCAL_GET && prev4Opcode === I32_CONST) { L = prev3A; k = prev4A; }
                    else if (prev3Opcode === LOCAL_GET && prev4Opcode === LOCAL_GET && prev3A !== prev4A) { L = Math.min(prev3A, prev4A); M = Math.max(prev3A, prev4A); }
                }
                if (opcode === UNCHECKED_ADDRESS) k += tape[offset + 3];
                if (L !== undefined && L !== b && M !== b) pointerAccesses.push({at: prevOffset, r: a, L, M, k, w: weightNow(), depth: loops});
            }
        }
        if (options.share) {
            if (opcode === LOCAL_GET || opcode === LITERAL_STORES) occur(a, offset, true);
            else if (opcode === LOCAL_SET) occur(a, offset, false);
            else if (opcode === CHECKED_ADDRESS || opcode === UNCHECKED_ADDRESS) { occur(a, offset, true); occur(b, offset, true); }
        }
        if (opcode === UNCHECKED_ADDRESS) {
            read(a); read(b);
            if (prevOpcode === LOCAL_SET && prevA === b)
                candidates.push({id: b, at: prev2Opcode === I32_CONST ? prev2Offset : prevOffset});
        }
        if (opcode === CHECKED_ADDRESS) {
            if (straight && receiver === undefined) receiver = a;
            if (options.capacities) {
                const before = scores.get(-1);
                weigh(-1);
                capacityUses.set(a, (capacityUses.get(a) ?? 0) + scores.get(-1) - (before ?? 0));
                scores.delete(-1);
            }
            read(a); read(b);
            if (prevOpcode === LOCAL_SET && prevA === b)
                candidates.push({id: b, at: prev2Opcode === I32_CONST ? prev2Offset : prevOffset});
        }
        if (opcode === LOCAL_GET || opcode === LITERAL_STORES) read(a);
        // constants: a literal the emitter would load into a register, scored like a local.
        if (opcode === I32_CONST && options.constants && constantForm(tape, offset + 1, options.select) === "register")
            weigh("c" + a);
        // An f32 constant always needs a register (two or three instructions to make): key "f<bits>", class f. Its
        // home is made in the prologue, on every call, so a use counts 0.6: two unconditional uses, or one in a loop,
        // claim a free register; one unconditional and one conditional use do not.
        if (opcode === F32_CONST && options.constants && a !== 0) weigh("f" + a, 0.6);
        if (opcode === LOCAL_SET) {
            writes.add(a);
            // A homed write turns a store into a move: worth less than a read, which disappears.
            if (options.saved) weigh(a, 0.5);
        }
        if (opcode === CALL && !inlineCall(a)) {
            leaf = false;
            if (options.callFree && tape[at] !== RETURN && at !== tape.length - 1) calls.push(offset);
        } else if (opcode === CALL) guarded = true;
        if (EFFECTS[opcode] & STORES) pure = false;
        if (opcode >= BLOCK && opcode <= IF) {
            blocks.push(opcode);
            if (opcode === LOOP) { loops++; loopStarts.push(offset); }
            if (opcode === IF) ifs++;
        }
        if (opcode === END) {
            const closed = blocks.pop();
            if (closed === LOOP) { loops--; loopSpans.push([loopStarts.pop(), offset]); }
            if (closed === IF) ifs--;
        }
        if (opcode >= BLOCK && opcode <= RETURN) straight = false;
        prev4Opcode = prev3Opcode; prev4A = prev3A; prev3Opcode = prev2Opcode; prev3A = prev2A;
        prev2Opcode = prevOpcode; prev2Offset = prevOffset; prev2A = prevA;
        prevOpcode = opcode; prevOffset = offset; prevA = a;
    }
    if (!options.capacity || !pure || !leaf || writes.has(receiver)) receiver = undefined;
    // A capacity register replaces a7 caching. A buffer's capacity header is written only by
    // the host, and a checked store at index i < capacity writes at 4 + 2i, so no store reaches
    // a header: the value read at entry stays valid. Only unwritten parameters qualify, so the
    // buffer is the same for the whole call; each use saves a load, at one load per call.
    if (options.capacities) {
        receiver = undefined;
        for (const [local, uses] of capacityUses)
            if (local < fn.params.length && inOwnRegister(fn, local) && !writes.has(local) && uses > 1) scores.set(-1 - local, uses - 1);
    }
    const forward = new Set(), homes = new Map();
    if (options.forward) for (const {id, at} of candidates) {
        if (reads.get(id) !== 1) continue;
        forward.add(at);
        scores.delete(id);
    }
    const direct = Boolean(options.direct);
    let intervals;
    if (options.share) {
        // Every Typed declaration has an initializer and is re-initialized on each iteration
        // of a loop that contains it, so a value crosses a loop's back edge only for a local
        // that also occurs before the loop: those intervals are widened to the whole loop,
        // innermost loops first. Parameters are live from entry; a local first read before
        // any write (a generated continuation slot) is live everywhere.
        intervals = new Map();
        for (const [local, start] of first) {
            if (readFirst.has(local) && local >= fn.params.length) continue;
            intervals.set(local, [local < fn.params.length ? -1 : start, last.get(local)]);
        }
        for (let p = 0; p < fn.params.length; p++) if (!intervals.has(p)) intervals.set(p, [-1, -1]);
        loopSpans.sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
        for (const [ls, le] of loopSpans)
            for (const span of intervals.values())
                if (span[0] < ls && span[1] >= ls && span[1] < le) span[1] = le;
    }
    // pointers: for accesses r[L + k] to an unwritten parameter r, a home p = r + 4 + 2(L + K0)
    // turns slli, add and lhu 4(.) into lhu 2(k - K0)(p). Every write of L updates p: an
    // addi for L = L + c, otherwise a recompute. Addresses are computed modulo 2^32 as
    // before, so p + 2(k - K0) is exactly r + 2(L + k) and the access is unchanged.
    const groups = new Map();
    if (options.pointers && options.saved) {
        const params = fn.params.length;
        for (const access of pointerAccesses) {
            if (!forward.has(access.at) || access.r >= params || readEarly.has(access.L) || readEarly.has(access.M)) continue;
            // The prologue makes a pointer home from the incoming registers: no parameter on the stack takes part.
            if (!inOwnRegister(fn, access.r) || [access.L, access.M].some(x => x < params && !inOwnRegister(fn, x))) continue;
            const key = "p" + access.r + ":" + access.L + (access.M === undefined ? "" : "+" + access.M);
            if (!groups.has(key)) groups.set(key, {r: access.r, L: access.L, M: access.M, list: []});
            groups.get(key).list.push(access);
        }
        for (const [key, g] of groups) {
            const sorted = g.list.slice().sort((x, y) => x.k - y.k);
            const total = sorted.reduce((sum, x) => sum + x.w, 0);
            let seen = 0;
            g.K0 = sorted[0].k;
            for (const x of sorted) if ((seen += x.w) * 2 >= total) { g.K0 = x.k; break; }
            g.covered = g.list.filter(x => Math.abs(x.k - g.K0) <= 1000);
            const sources = g.M === undefined ? [g.L] : [g.L, g.M];
            // Initialized in the prologue only when every source is a parameter.
            let cost = sources.every(x => x < params) ? sources.length + 2 : 0;
            // For r[L + M]: a write outside the accesses' innermost loop runs once per entry of
            // that loop, so its weight is divided by a further 4 per level, as if inner loops
            // ran 16 times. (Applied to r[L + k] too, it converts conditional accesses whose
            // saving does not cover a per-iteration update.)
            const depth = Math.max(...g.covered.map(x => x.depth));
            for (const source of sources) for (const write of writesOf.get(source) ?? [])
                cost += write.w / (g.M === undefined ? 1 : 4 ** Math.max(0, depth - write.depth)) *
                    (write.inc !== undefined && Math.abs(2 * write.inc) <= 2047 ? 1 : sources.length + 3);
            const gain = 2 * g.covered.reduce((sum, x) => sum + x.w, 0) - cost;
            if (gain < 2) continue;
            scores.set(key, gain);
            if (intervals) {
                // p is written at every write of a source and read at the accesses, which
                // also read the sources: the hull of the sources' intervals covers both.
                const spans = sources.map(x => intervals.get(x) ?? [-Infinity, Infinity]);
                intervals.set(key, [Math.min(...spans.map(x => x[0])), Math.max(...spans.map(x => x[1]))]);
            }
        }
    }
    const callFree = options.callFree && !leaf && !guarded && intervals && floatingFunction(fn) ? calls : undefined;
    if (options.saved) planSavedHomes(fn, scores, homes, leaf, receiver !== undefined, intervals, options.reuseArgs, callFree);
    else if (options.homes && leaf) {
        let reg = A0 + Math.max(1, fn.params.length);
        const end = A0 + (receiver === undefined ? 8 : 7);
        for (const [id,score] of [...scores].sort((a,b)=>b[1]-a[1])) {
            if (keyClass(fn, id) !== X) continue; // homes without saved: integer argument registers only
            if (reg >= end || score < 2) break;
            homes.set(id, reg++);
        }
    }
    const pointers = new Map(), pointerWrites = new Map(), increments = new Map();
    for (const [key, g] of groups) {
        const reg = homes.get(key);
        if (reg === undefined || !g.covered) continue;
        for (const x of g.covered) pointers.set(x.at, {reg, disp: 2 * (x.k - g.K0)});
        for (const [source, other] of g.M === undefined ? [[g.L, undefined]] : [[g.L, g.M], [g.M, g.L]]) {
            if (!pointerWrites.has(source)) pointerWrites.set(source, []);
            pointerWrites.get(source).push({reg, r: g.r, K0: g.K0, other});
        }
    }
    for (const local of pointerWrites.keys()) for (const write of writesOf.get(local) ?? [])
        if (write.inc !== undefined && Math.abs(2 * write.inc) <= 2047) increments.set(write.at, write.inc);
    // operandLocations.pointerOnly: a source whose every read is either a covered access of its
    // own single-source pointer group (one read each) or its own step L = L + c (one read each)
    // is read only through the pointer: its steps need only advance the pointer, so the emitter
    // replaces `get L; const c; add; set L` by `addi p, p, 2c` (skips: statement start -> step).
    const skips = options.pointerOnly ? new Map() : undefined;
    if (skips) for (const [key, g] of groups) {
        if (homes.get(key) === undefined || !g.covered || g.M !== undefined) continue;
        const steps = (writesOf.get(g.L) ?? []).filter(w => w.inc !== undefined);
        const covered = [...groups.values()].filter(h => h.L === g.L && h.M === undefined && homes.get("p" + h.r + ":" + h.L) !== undefined)
            .reduce((n, h) => n + h.covered.length, 0);
        if (g.L < fn.params.length || reads.get(g.L) !== covered + steps.length) continue;
        if (!steps.every(w => increments.has(w.at))) continue;
        // After a skipped step L is stale, so in the innermost loop around each step every read of
        // L must be an unchecked access (which needs no index) or a step. A checked access needs
        // L's value for its bounds check; the slow copy of a versioned loop recomputes L from its
        // definition, which is not a step, so its checked accesses see the exact value.
        const L = g.L, unchecked = q => tape[q] === UNCHECKED_ADDRESS;
        const safeRead = q => (tape[q + 2] === LOCAL_SET && unchecked(q + 4)) ||
            (tape[q + 2] === I32_CONST && tape[q + 4] === I32_ADD && tape[q + 5] === LOCAL_SET && (tape[q + 6] === L || unchecked(q + 7))) ||
            (q >= 2 && tape[q - 2] === I32_CONST && tape[q + 2] === I32_ADD && tape[q + 3] === LOCAL_SET && unchecked(q + 5));
        let stale = false;
        for (const w of steps) {
            const span = loopSpans.filter(([s0, e0]) => s0 <= w.at && w.at <= e0).sort((x, y) => y[0] - x[0])[0];
            if (!span) { stale = true; break; }
            for (let q = span[0]; q < span[1] && !stale; q = opNext(tape, q)) {
                const op = tape[q];
                if ((op === LOCAL_GET || op === LITERAL_STORES) && tape[q + 1] === L && !(op === LOCAL_GET && safeRead(q))) stale = true;
                if ((op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) && (tape[q + 1] === L || tape[q + 2] === L)) stale = true;
            }
        }
        if (stale) continue;
        for (const w of steps) skips.set(w.at - 5, {end: w.at + 2, local: g.L, inc: w.inc});
    }
    // scores and intervals are what planSavedHomes chose from; only observePlan reads them.
    return {receiver,forward,homes,direct,pointers,pointerWrites,increments,skips,scores,intervals,callFree: homes.callFree};
}
