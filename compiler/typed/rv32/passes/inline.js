// The inline pass and the inliner's library candidates.
import {CELLS, BLOCK, IF, LOOP, END, CALL, LOCAL_GET, I32_CONST, LOCAL_SET, DROP, BR_IF, I32_EQZ, I32_LOAD, I32_LOAD16_U, I32_EQ, I32_GE_U, I32_ADD, I32_SHR_U, I32_STORE, I32_STORE16, CHECKED_ADDRESS, I32, F32, VOID, ELSE, RETURN, BR, LITERAL_STORES, FLOATING, tapeRow, ARRAY_ADDRESS} from "../encoding/tape.js";

// inline: replace calls to small internal functions lowered earlier with their tapes.
// A call `args…; call f` becomes `local.set p_{n-1} … local.set p_0; block (result i32)
// <f's tape> end`, where f's locals are renumbered into a range of the caller's locals and
// each `return` becomes a branch to the new block. Every Typed function returns a value
// and every declaration has an initializer, so the inlined block needs no zeroed locals;
// repeated inlining of the same callee into one caller shares one local range, which is
// safe because inlined bodies never overlap in time (a callee is never its own ancestor).
//
// An argument that is a plain local read or a literal, for a parameter the callee never
// writes, is substituted into the body instead of copied: the caller's `local.get x` or
// `i32.const c` cells are removed and the callee reads x or c directly. A literal is not
// substituted for a parameter used as a checked-address operand, which must be a local.
//
// A callee with a record result (several results) becomes `block; <f's tape> end; local.get r_0 ... r_{n-1}`: the
// tape's block types hold one value, so each `return` and the final `end` first store the leaves into result locals
// r_i, which follow the callee's own locals in its range.
//
// Only calls inside a caller's loop are inlined, unless `anywhere` is set or the callee has an f32 parameter, local
// or result (an f32 call costs its caller saved f registers and spills, and f32 helpers are small); the library
// keeps each candidate fully expanded (`anywhere`), so a callee inlined into a loop brings
// its own callees with it.
// maxLoopDepth bounds the loop nesting a call site and the callee's own loops may form
// together: a callee whose loops already amortize its call is left out of a caller's loop.
export const INLINE_DEFAULTS = Object.freeze({calleeCells: 1000, callerCells: 8000, maxLoopDepth: 2});

export function loopDepth(code) {
    let depth = 0, deepest = 0;
    const blocks = [];
    for (let at = 0; at < code.length; at += 1 + CELLS[code[at]]) {
        const op = code[at];
        if (op >= BLOCK && op <= IF) { blocks.push(op); if (op === LOOP) deepest = Math.max(deepest, ++depth); }
        if (op === END && blocks.pop() === LOOP) depth--;
    }
    return deepest;
}

export function inlineCalls(fn, library, limits, arity, anywhere) {
    const tape = fn.code;
    // Cheap rejections before the walk: no call to a library function, or (for the
    // function's own code) no loop. Operand cells can match too, which only costs a walk.
    let candidate = false, float = false;
    for (let i = tape.indexOf(CALL); i >= 0 && !float; i = tape.indexOf(CALL, i + 1)) {
        const callee = library.get(tape[i + 1]);
        candidate ||= callee !== undefined;
        float ||= callee?.types !== undefined;
    }
    if (!candidate || (!anywhere && !float && !tape.includes(LOOP))) return null;
    // Until the first inlined call the output is a copy of the input, so the output length at
    // a call is its offset: a scan of the call sites decides exactly whether any is inlined.
    {
        let loops = 0, site = false;
        const opened = [];
        for (let at = 0; at < tape.length && !site;) {
            const opcode = tape[at], cells = CELLS[opcode];
            if (cells < 0) return null;
            if (opcode === CALL && (anywhere || loops > 0 || library.get(tape[at + 1])?.types)) {
                const callee = library.get(tape[at + 1]);
                site = callee !== undefined && at + callee.code.length <= limits.callerCells &&
                    loops + callee.loops <= limits.maxLoopDepth;
            } else if (opcode >= BLOCK && opcode <= IF) {
                opened.push(opcode);
                if (opcode === LOOP) loops++;
            } else if (opcode === END && opened.length && opened.pop() === LOOP) loops--;
            at += 1 + cells;
        }
        if (!site) return null;
    }
    // Abstract operand stack, as parallel arrays: where each entry's cells start in the output,
    // and whether it is a plain local.get (kind 1) or i32.const (kind 2) of `value`; kind 0 is
    // any other value.
    const bases = new Map(), out = [], blocks = [], stackAt = [], stackKind = [], stackValue = [];
    let locals = fn.params.length + fn.nlocals, loops = 0, changed = false, sp = 0, types;
    const push = (at, kind, value) => { stackAt[sp] = at; stackKind[sp] = kind; stackValue[sp] = value; sp++; };
    const pop = n => { sp = Math.max(0, sp - n); };
    for (let at = 0; at < tape.length;) {
        const opcode = tape[at], cells = CELLS[opcode], a = tape[at + 1];
        if (cells < 0) return null;
        let callee = opcode === CALL ? library.get(a) : undefined;
        if (callee && !anywhere && loops === 0 && !callee.types) callee = undefined;
        if (callee && (out.length + callee.code.length > limits.callerCells || loops + callee.loops > limits.maxLoopDepth))
            callee = undefined;
        if (!callee) {
            const start = out.length;
            for (let k = 0; k <= cells; k++) out.push(tape[at + k]);
            at += 1 + cells;
            if (opcode === LOCAL_GET) push(start, 1, a);
            else if (opcode === I32_CONST) push(start, 2, a);
            else if (opcode === LOCAL_SET) {
                pop(1);
                for (let i = 0; i < sp; i++) if (stackKind[i] === 1 && stackValue[i] === a) stackKind[i] = 0;
            } else if (opcode === DROP || opcode === BR_IF) pop(1);
            else if (opcode === I32_EQZ || opcode === I32_LOAD || opcode === I32_LOAD16_U) { pop(1); push(0, 0, 0); }
            else if ((opcode >= I32_EQ && opcode <= I32_GE_U) || (opcode >= I32_ADD && opcode <= I32_SHR_U)) { pop(2); push(0, 0, 0); }
            else if (opcode === I32_STORE || opcode === I32_STORE16) pop(2);
            else if (opcode === CHECKED_ADDRESS || opcode === ARRAY_ADDRESS) push(0, 0, 0);
            else if (opcode === CALL) {
                pop(arity(a));
                for (let n = arity.results?.(a) ?? 1; n > 0; n--) push(0, 0, 0);
            }
            else if (opcode >= BLOCK && opcode <= IF) {
                if (opcode === IF) pop(1);
                blocks.push({op: opcode, value: a !== VOID, height: sp});
                if (opcode === LOOP) loops++;
            } else if (opcode === ELSE) sp = blocks.at(-1).height;
            else if (opcode === END && blocks.length) {
                const block = blocks.pop();
                if (block.op === LOOP) loops--;
                sp = block.height;
                if (block.value) push(0, 0, 0);
            } else if (FLOATING[opcode]) {
                // An f32 operation: its pops and pushes from tape.js; its result is never a plain local or literal.
                const row = tapeRow(opcode);
                pop(row.pop.length);
                if (row.push.length) push(0, 0, 0);
            }
            continue;
        }
        at += 2;
        let base = bases.get(callee);
        if (base === undefined) {
            base = locals;
            bases.set(callee, base);
            locals += callee.params + callee.nlocals + (callee.results?.length ?? 0);
            // The callee's local types join the caller's (fn.localTypes, undefined entries are i32), and so do the
            // types of its result locals.
            if (callee.types || callee.results?.includes("f32")) {
                const own = types ??= (fn.localTypes ?? []).slice();
                for (let i = 0; i < (callee.types?.length ?? 0); i++) own[base - fn.params.length + i] = callee.types[i];
                const results = base - fn.params.length + callee.params + callee.nlocals;
                callee.results?.forEach((type, r) => { own[results + r] = type === "f32" ? "f32" : "i32"; });
            }
        }
        // The arguments are the top callee.params entries (Array.prototype.slice semantics when
        // the abstract stack is shorter).
        let first = sp - callee.params;
        if (first < 0) first = Math.max(0, sp + first);
        const subst = [];
        for (let i = first; i < sp; i++) {
            const kind = stackKind[i], n = i - first;
            let arg;
            if (kind !== 0 && !callee.written[n]) {
                const at0 = stackAt[i], value = stackValue[i];
                if (kind === 1 ? out[at0] === LOCAL_GET && out[at0 + 1] === value : out[at0] === I32_CONST && out[at0 + 1] === value)
                    if (kind === 1 || !callee.addressed[n]) arg = kind === 1 ? {at: at0, local: value} : {at: at0, constant: value};
            }
            subst.push(arg);
        }
        for (const arg of subst.filter(Boolean).sort((x, y) => y.at - x.at)) out.splice(arg.at, 2);
        pop(callee.params);
        for (let i = callee.params - 1; i >= 0; i--) if (!subst[i]) out.push(LOCAL_SET, base + i);
        const results = callee.results?.length ?? 0, resultBase = base + callee.params + callee.nlocals;
        const storeResults = () => { for (let r = results - 1; r >= 0; r--) out.push(LOCAL_SET, resultBase + r); };
        out.push(BLOCK, results ? VOID : callee.result === "f32" ? F32 : I32);
        const local = v => v < callee.params && subst[v] ? subst[v].local : base + v;
        let depth = 0;
        const body = callee.code;
        for (let k = 0; k < body.length;) {
            const op = body[k], n = CELLS[op], v = body[k + 1];
            k += 1 + n;
            if (op === RETURN) { storeResults(); out.push(BR, depth); continue; }
            if (op >= BLOCK && op <= IF) depth++;
            if (op === END) depth--;
            if (op === END && depth < 0) storeResults();
            if (op === LOCAL_GET && v < callee.params && subst[v]?.constant !== undefined) out.push(I32_CONST, subst[v].constant);
            else if (op === LOCAL_GET || op === LOCAL_SET) out.push(op, local(v));
            else if (op === CHECKED_ADDRESS) out.push(op, local(v), local(body[k - 1]));
            else for (let j = n; j >= 0; j--) out.push(body[k - 1 - j]);
        }
        // The callee's final `end` closed its function; here it closes the inlined block. Its result locals are plain
        // local.get operands a later inlined call may substitute; an earlier copy's, which this copy has just
        // overwritten, no longer are (the callee's range is shared by every copy).
        for (let i = 0; i < sp; i++) if (stackKind[i] === 1 && stackValue[i] >= base && stackValue[i] < resultBase + results)
            stackKind[i] = 0;
        if (!results) push(0, 0, 0);
        for (let r = 0; r < results; r++) {
            push(out.length, 1, resultBase + r);
            out.push(LOCAL_GET, resultBase + r);
        }
        changed = true;
    }
    if (types) for (let i = 0; i < locals - fn.params.length; i++) types[i] ??= "i32";
    return changed ? {code: out, nlocals: locals - fn.params.length, localTypes: types ?? fn.localTypes} : null;
}

// A function the inliner may copy: short, no literal stores (their table is per function),
// no calls to itself, and not an async state machine. Records which parameters the body
// writes and which it uses as checked-address operands.
export function inlineCandidate(fn, code, limits, guarded) {
    // A callee's local arrays would need a place in the caller's area: such a callee stays a call.
    if (fn.async || guarded || fn.literals || fn.arrayBytes || code.length > limits.calleeCells) return null;
    const written = fn.params.map(() => false), addressed = fn.params.map(() => false);
    for (let at = 0; at < code.length;) {
        const op = code[at], n = CELLS[op];
        if (n < 0 || op === LITERAL_STORES || (op === CALL && code[at + 1] === fn.index)) return null;
        if (op === LOCAL_SET && code[at + 1] < fn.params.length) written[code[at + 1]] = true;
        if (op === CHECKED_ADDRESS) for (const v of [code[at + 1], code[at + 2]]) if (v < fn.params.length) addressed[v] = true;
        at += 1 + n;
    }
    return {params: fn.params.length, written, addressed, result: fn.result, results: fn.results};
}

// The types of a library copy's parameters and frame locals, when one is an f32 (inlineCalls copies them into
// the caller's fn.localTypes); undefined for an integer-only copy.
export function inlineTypes(fn, copy) {
    if (!fn.params.includes("f32") && !copy.localTypes) return undefined;
    const types = fn.params.map(type => type === "f32" ? type : "i32");
    for (let i = 0; i < copy.nlocals; i++) types.push(copy.localTypes?.[i] ?? "i32");
    return types;
}

