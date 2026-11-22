// Operand cells that follow each numeric opcode in a function's tape. The planner
// walks the raw cells: decoding the tape into operation records allocated several
// objects per operation, which cost a bare interpreter roughly a quarter of the
// whole compile even when no policy was enabled.
const OPERAND_CELLS = new Int8Array(256).fill(-1);
for (const [opcode, cells] of [
    [0x00,0],[0x02,1],[0x03,1],[0x04,1],[0x05,0],[0x0b,0],[0x0c,1],[0x0d,1],[0x0f,0],
    [0x10,1],[0x1a,0],[0x20,1],[0x21,1],[0x28,2],[0x2f,2],[0x36,2],[0x3b,2],[0x41,1],
    [0x45,0],[0x46,0],[0x47,0],[0x48,0],[0x4a,0],[0x4c,0],[0x4e,0],[0x4f,0],
    [0x6a,0],[0x6b,0],[0x6c,0],[0x6d,0],[0x6f,0],[0x74,0],[0x75,0],[0xf1,2],[0xf2,2],[0xf3,3],
]) OPERAND_CELLS[opcode] = cells;

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
// Only calls inside a caller's loop are inlined, unless `anywhere` is set; the library
// keeps each candidate fully expanded (`anywhere`), so a callee inlined into a loop brings
// its own callees with it.
// maxLoopDepth bounds the loop nesting a call site and the callee's own loops may form
// together: a callee whose loops already amortize its call is left out of a caller's loop.
const INLINE_DEFAULTS = Object.freeze({calleeCells: 1000, callerCells: 8000, maxLoopDepth: 2});

function loopDepth(code) {
    let depth = 0, deepest = 0;
    const blocks = [];
    for (let at = 0; at < code.length; at += 1 + OPERAND_CELLS[code[at]]) {
        const op = code[at];
        if (op >= 0x02 && op <= 0x04) { blocks.push(op); if (op === 0x03) deepest = Math.max(deepest, ++depth); }
        if (op === 0x0b && blocks.pop() === 0x03) depth--;
    }
    return deepest;
}

function inlineCalls(fn, library, limits, arity, anywhere) {
    const tape = fn.code;
    // Cheap rejections before the walk: no call to a library function, or (for the
    // function's own code) no loop. Operand cells can match too, which only costs a walk.
    let candidate = false;
    for (let i = tape.indexOf(0x10); i >= 0 && !candidate; i = tape.indexOf(0x10, i + 1)) candidate = library.has(tape[i + 1]);
    if (!candidate || (!anywhere && !tape.includes(0x03))) return null;
    // Until the first inlined call the output is a copy of the input, so the output length at
    // a call is its offset: a scan of the call sites decides exactly whether any is inlined.
    {
        let loops = 0, site = false;
        const opened = [];
        for (let at = 0; at < tape.length && !site;) {
            const opcode = tape[at], cells = OPERAND_CELLS[opcode];
            if (cells < 0) return null;
            if (opcode === 0x10 && (anywhere || loops > 0)) {
                const callee = library.get(tape[at + 1]);
                site = callee !== undefined && at + callee.code.length <= limits.callerCells &&
                    loops + callee.loops <= limits.maxLoopDepth;
            } else if (opcode >= 0x02 && opcode <= 0x04) {
                opened.push(opcode);
                if (opcode === 0x03) loops++;
            } else if (opcode === 0x0b && opened.length && opened.pop() === 0x03) loops--;
            at += 1 + cells;
        }
        if (!site) return null;
    }
    // Abstract operand stack, as parallel arrays: where each entry's cells start in the output,
    // and whether it is a plain local.get (kind 1) or i32.const (kind 2) of `value`; kind 0 is
    // any other value.
    const bases = new Map(), out = [], blocks = [], stackAt = [], stackKind = [], stackValue = [];
    let locals = fn.params.length + fn.nlocals, loops = 0, changed = false, sp = 0;
    const push = (at, kind, value) => { stackAt[sp] = at; stackKind[sp] = kind; stackValue[sp] = value; sp++; };
    const pop = n => { sp = Math.max(0, sp - n); };
    for (let at = 0; at < tape.length;) {
        const opcode = tape[at], cells = OPERAND_CELLS[opcode], a = tape[at + 1];
        if (cells < 0) return null;
        let callee = opcode === 0x10 && (anywhere || loops > 0) ? library.get(a) : undefined;
        if (callee && (out.length + callee.code.length > limits.callerCells || loops + callee.loops > limits.maxLoopDepth))
            callee = undefined;
        if (!callee) {
            const start = out.length;
            for (let k = 0; k <= cells; k++) out.push(tape[at + k]);
            at += 1 + cells;
            if (opcode === 0x20) push(start, 1, a);
            else if (opcode === 0x41) push(start, 2, a);
            else if (opcode === 0x21) {
                pop(1);
                for (let i = 0; i < sp; i++) if (stackKind[i] === 1 && stackValue[i] === a) stackKind[i] = 0;
            } else if (opcode === 0x1a || opcode === 0x0d) pop(1);
            else if (opcode === 0x45 || opcode === 0x28 || opcode === 0x2f) { pop(1); push(0, 0, 0); }
            else if ((opcode >= 0x46 && opcode <= 0x4f) || (opcode >= 0x6a && opcode <= 0x75)) { pop(2); push(0, 0, 0); }
            else if (opcode === 0x36 || opcode === 0x3b) pop(2);
            else if (opcode === 0xf1) push(0, 0, 0);
            else if (opcode === 0x10) { pop(arity(a)); push(0, 0, 0); }
            else if (opcode >= 0x02 && opcode <= 0x04) {
                if (opcode === 0x04) pop(1);
                blocks.push({op: opcode, value: a === 0x7f, height: sp});
                if (opcode === 0x03) loops++;
            } else if (opcode === 0x05) sp = blocks.at(-1).height;
            else if (opcode === 0x0b && blocks.length) {
                const block = blocks.pop();
                if (block.op === 0x03) loops--;
                sp = block.height;
                if (block.value) push(0, 0, 0);
            }
            continue;
        }
        at += 2;
        let base = bases.get(callee);
        if (base === undefined) {
            base = locals;
            bases.set(callee, base);
            locals += callee.params + callee.nlocals;
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
                if (kind === 1 ? out[at0] === 0x20 && out[at0 + 1] === value : out[at0] === 0x41 && out[at0 + 1] === value)
                    if (kind === 1 || !callee.addressed[n]) arg = kind === 1 ? {at: at0, local: value} : {at: at0, constant: value};
            }
            subst.push(arg);
        }
        for (const arg of subst.filter(Boolean).sort((x, y) => y.at - x.at)) out.splice(arg.at, 2);
        pop(callee.params);
        for (let i = callee.params - 1; i >= 0; i--) if (!subst[i]) out.push(0x21, base + i);
        out.push(0x02, 0x7f);
        const local = v => v < callee.params && subst[v] ? subst[v].local : base + v;
        let depth = 0;
        const body = callee.code;
        for (let k = 0; k < body.length;) {
            const op = body[k], n = OPERAND_CELLS[op], v = body[k + 1];
            k += 1 + n;
            if (op === 0x0f) { out.push(0x0c, depth); continue; }
            if (op >= 0x02 && op <= 0x04) depth++;
            if (op === 0x0b) depth--;
            if (op === 0x20 && v < callee.params && subst[v]?.constant !== undefined) out.push(0x41, subst[v].constant);
            else if (op === 0x20 || op === 0x21) out.push(op, local(v));
            else if (op === 0xf1) out.push(op, local(v), local(body[k - 1]));
            else for (let j = n; j >= 0; j--) out.push(body[k - 1 - j]);
        }
        // The callee's final `end` closed its function; here it closes the inlined block.
        push(0, 0, 0);
        changed = true;
    }
    return changed ? {code: out, nlocals: locals - fn.params.length} : null;
}

// select.commute: `c OP e` becomes `e c OP` for a literal c and commutative OP (add, mul,
// eq, ne), so the literal reaches selectConstant as a right operand. Moving a literal past
// e cannot change e's effects. Each abstract stack entry records where its cells start in
// the output; an expression whose start is not certain (a value block) is NaN and is never
// moved past.
const COMMUTATIVE = new Set([0x6a, 0x6c, 0x46, 0x47]);

function commuteConstants(code, arity) {
    const out = [], stack = [], blocks = [];
    let changed = false;
    for (let at = 0; at < code.length;) {
        const op = code[at], cells = OPERAND_CELLS[op], a = code[at + 1];
        if (cells < 0) return null;
        const start = out.length;
        if ((op >= 0x46 && op <= 0x4f) || (op >= 0x6a && op <= 0x75)) {
            const right = stack.pop(), left = stack.pop();
            if (!left || !right) return null;
            if (COMMUTATIVE.has(op) && left.constant !== undefined && right.constant === undefined &&
                left.start + 2 === right.start && out[left.start] === 0x41) {
                out.push(...out.splice(left.start, 2));
                changed = true;
            }
            out.push(op);
            stack.push({start: left.start});
            at++;
            continue;
        }
        for (let k = 0; k <= cells; k++) out.push(code[at + k]);
        at += 1 + cells;
        if (op === 0x41) stack.push({start, constant: a});
        else if (op === 0x20 || op === 0xf1) stack.push({start});
        else if (op === 0x45 || op === 0x28 || op === 0x2f) stack.push({start: stack.pop()?.start ?? NaN});
        else if (op === 0x21 || op === 0x1a || op === 0x0d) stack.pop();
        else if (op === 0x36 || op === 0x3b) { stack.pop(); stack.pop(); }
        else if (op === 0x10) {
            const n = arity(a), args = stack.splice(stack.length - n, n);
            stack.push({start: n ? args[0]?.start ?? NaN : start});
        } else if (op >= 0x02 && op <= 0x04) {
            if (op === 0x04) stack.pop();
            blocks.push({value: a === 0x7f, height: stack.length});
        } else if (op === 0x05) stack.length = blocks.at(-1).height;
        else if (op === 0x0b && blocks.length) {
            const block = blocks.pop();
            stack.length = block.height;
            if (block.value) stack.push({start: NaN});
        }
    }
    return changed ? out : null;
}

