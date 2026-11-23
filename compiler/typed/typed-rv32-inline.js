// Generated from compiler/typed/rv32/ by compiler/typed/rv32/build.mjs. Edit those files, not this one.
// The RV32 passes of the "inline" group: inline, commute, rotate. Load after typed-rv32.js.
// This code executes in the host tools and can execute in a bare QuickJS realm.
(() => {
"use strict";
if (!globalThis.typedRv32Modules) throw new Error("load typed-rv32.js before typed-rv32-inline.js");
const {ARRAY_ADDRESS, BLOCK, BR, BR_IF, CALL, CELLS, CHECKED_ADDRESS, DROP, EFFECTS, ELSE, END, F32, F32_LOAD, FLOATING, I32, I32_ADD, I32_AND, I32_CONST, I32_EQ, I32_EQZ, I32_GE_U, I32_LOAD, I32_LOAD16_U, I32_MUL, I32_NE, I32_OR, I32_SHR_U, I32_STORE, I32_STORE16, I32_XOR, IF, LITERAL_STORES, LOCAL_GET, LOCAL_SET, LOOP, RETURN, STORES, UNREACHABLE, VOID, floatingFunction, installPasses, opNext, replaceTape, tapeRow} = globalThis.typedRv32Modules;

// rv32/passes/inline.js
// The inline pass and the inliner's library candidates.

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
// r_i, which follow the callee's own locals in its range. A callee with a record result and no `return` before its
// final `end` is copied without the block, leaving its leaves on the operand stack (PICOCALC-CANDELA-KERNEL-CODEGEN).
//
// Only calls inside a caller's loop are inlined, unless `anywhere` is set or the callee has an f32 parameter, local
// or result (an f32 call costs its caller saved f registers and spills, and f32 helpers are small; `floating`); the library
// keeps each candidate fully expanded (`anywhere`), so a callee inlined into a loop brings
// its own callees with it.
// maxLoopDepth bounds the loop nesting a call site and the callee's own loops may form
// together: a callee whose loops already amortize its call is left out of a caller's loop.
// callerLocals bounds the caller's locals after inlining (each callee inlined the first time adds its parameters,
// locals and result locals): a frame holds a slot per local and reaches about 1000 slots, and split may add more.
const INLINE_DEFAULTS = Object.freeze({calleeCells: 1000, callerCells: 8000, maxLoopDepth: 2, callerLocals: 400});

function loopDepth(code) {
    let depth = 0, deepest = 0;
    const blocks = [];
    for (let at = 0; at < code.length; at += 1 + CELLS[code[at]]) {
        const op = code[at];
        if (op >= BLOCK && op <= IF) { blocks.push(op); if (op === LOOP) deepest = Math.max(deepest, ++depth); }
        if (op === END && blocks.pop() === LOOP) depth--;
    }
    return deepest;
}

// A library candidate with an f32 parameter, local or result (a record result's leaves included).
const floating = callee => callee !== undefined && (callee.types !== undefined || callee.result === "f32" ||
    Boolean(callee.results?.includes("f32")));

function inlineCalls(fn, library, limits, arity, anywhere) {
    const tape = fn.code;
    // Cheap rejections before the walk: no call to a library function, or (for the
    // function's own code) no loop. Operand cells can match too, which only costs a walk.
    let candidate = false, float = false;
    for (let i = tape.indexOf(CALL); i >= 0 && !float; i = tape.indexOf(CALL, i + 1)) {
        const callee = library.get(tape[i + 1]);
        candidate ||= callee !== undefined;
        float ||= floating(callee);
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
            if (opcode === CALL && (anywhere || loops > 0 || floating(library.get(tape[at + 1])))) {
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
        if (callee && !anywhere && loops === 0 && !floating(callee)) callee = undefined;
        if (callee && (out.length + callee.code.length > limits.callerCells || loops + callee.loops > limits.maxLoopDepth))
            callee = undefined;
        if (callee && !bases.has(callee) &&
            locals - fn.params.length + callee.params + callee.nlocals + (callee.results?.length ?? 0) > limits.callerLocals)
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
        const open = results > 0 && !callee.returns;
        if (!open) out.push(BLOCK, results ? VOID : callee.result === "f32" ? F32 : I32);
        const local = v => v < callee.params && subst[v] ? subst[v].local : base + v;
        let depth = 0;
        const body = callee.code;
        for (let k = 0; k < body.length;) {
            const op = body[k], n = CELLS[op], v = body[k + 1];
            k += 1 + n;
            if (op === RETURN) { storeResults(); out.push(BR, depth); continue; }
            if (op >= BLOCK && op <= IF) depth++;
            if (op === END) depth--;
            if (op === END && depth < 0) {
                if (open) continue;
                storeResults();
            }
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
        if (open) for (let r = 0; r < results; r++) push(0, 0, 0);
        else for (let r = 0; r < results; r++) {
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
function inlineCandidate(fn, code, limits, guarded) {
    // A callee's local arrays would need a place in the caller's area: such a callee stays a call.
    if (fn.async || guarded || fn.literals || fn.arrayBytes || code.length > limits.calleeCells) return null;
    const written = fn.params.map(() => false), addressed = fn.params.map(() => false);
    let returns = false;
    for (let at = 0; at < code.length;) {
        const op = code[at], n = CELLS[op];
        if (n < 0 || op === LITERAL_STORES || (op === CALL && code[at + 1] === fn.index)) return null;
        if (op === RETURN) returns = true;
        if (op === LOCAL_SET && code[at + 1] < fn.params.length) written[code[at + 1]] = true;
        if (op === CHECKED_ADDRESS) for (const v of [code[at + 1], code[at + 2]]) if (v < fn.params.length) addressed[v] = true;
        at += 1 + n;
    }
    return {params: fn.params.length, written, addressed, result: fn.result, results: fn.results, returns};
}

// The types of a library copy's parameters and frame locals, when one is an f32 (inlineCalls copies them into
// the caller's fn.localTypes); undefined for an integer-only copy.
function inlineTypes(fn, copy) {
    if (!fn.params.includes("f32") && !copy.localTypes) return undefined;
    const types = fn.params.map(type => type === "f32" ? type : "i32");
    for (let i = 0; i < copy.nlocals; i++) types.push(copy.localTypes?.[i] ?? "i32");
    return types;
}

// rv32/passes/commute.js
// The commute pass.

// the commute pass: `c OP e` becomes `e c OP` for a literal c and commutative OP (add, mul,
// eq, ne, and, or, xor), so the literal reaches selectConstant as a right operand. Moving a literal past
// e cannot change e's effects. Each abstract stack entry records where its cells start in
// the output; an expression whose start is not certain (a value block) is NaN and is never
// moved past.
const COMMUTATIVE = new Set([I32_ADD, I32_MUL, I32_EQ, I32_NE, I32_AND, I32_OR, I32_XOR]);

function commuteConstants(code, arity) {
    const out = [], stack = [], blocks = [];
    let changed = false;
    for (let at = 0; at < code.length;) {
        const op = code[at], cells = CELLS[op], a = code[at + 1];
        if (cells < 0) return null;
        const start = out.length;
        if ((op >= I32_EQ && op <= I32_GE_U) || (op >= I32_ADD && op <= I32_SHR_U)) {
            const right = stack.pop(), left = stack.pop();
            if (!left || !right) return null;
            if (COMMUTATIVE.has(op) && left.constant !== undefined && right.constant === undefined &&
                left.start + 2 === right.start && out[left.start] === I32_CONST) {
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
        if (op === I32_CONST) stack.push({start, constant: a});
        else if (op === LOCAL_GET || op === CHECKED_ADDRESS || op === ARRAY_ADDRESS) stack.push({start});
        else if (op === I32_EQZ || op === I32_LOAD || op === I32_LOAD16_U) stack.push({start: stack.pop()?.start ?? NaN});
        else if (op === LOCAL_SET || op === DROP || op === BR_IF) stack.pop();
        else if (op === I32_STORE || op === I32_STORE16) { stack.pop(); stack.pop(); }
        else if (op === CALL) {
            const n = arity(a), args = stack.splice(stack.length - n, n);
            stack.push({start: n ? args[0]?.start ?? NaN : start});
            // A record result's further leaves start nowhere a literal could move past.
            for (let k = arity.results?.(a) ?? 1; k > 1; k--) stack.push({start: NaN});
        } else if (op >= BLOCK && op <= IF) {
            if (op === IF) stack.pop();
            blocks.push({value: a !== VOID, height: stack.length});
        } else if (op === ELSE) stack.length = blocks.at(-1).height;
        else if (op === END && blocks.length) {
            const block = blocks.pop();
            stack.length = block.height;
            if (block.value) stack.push({start: NaN});
        } else if (FLOATING[op]) {
            // An f32 operation, by its row: it starts where its first operand does (or here, without operands).
            const row = tapeRow(op), args = stack.splice(stack.length - row.pop.length, row.pop.length);
            if (row.push.length) stack.push({start: row.pop.length ? args[0]?.start ?? NaN : start});
        }
    }
    return changed ? out : null;
}

// rv32/passes/rotate.js
// The rotate pass.

// the rotate pass: the frontend emits every loop as
//     block; loop; C; eqz; br_if 1; B; br 0; end; end
// which runs C, a taken skip over the exit jump, B and a taken jump back per iteration.
// Rotated, the loop is
//     block; C; eqz; br_if 0; loop; B; C; br_if 0; end; end
// and each iteration ends in one backward conditional branch. C is evaluated at the same
// points as before (once before every iteration and once to exit). Labels inside B keep
// their meaning; C is copied only if every branch in it targets a block inside C.

function rotateLoops(code) {
    const next = at => at + 1 + CELLS[code[at]];
    // Matching `end` of the block or loop opened at `at`.
    function close(at) {
        let depth = 0;
        for (let k = at; k < code.length; k = next(k)) {
            const op = code[k];
            if (op >= BLOCK && op <= IF) depth++;
            else if (op === END && --depth === 0) return k;
        }
        return -1;
    }
    let changed = false;
    function emit(from, to, out) {
        for (let at = from; at < to;) {
            if (code[at] === BLOCK && code[at + 1] === VOID && code[at + 2] === LOOP && code[at + 3] === VOID) {
                const loopEnd = close(at + 2), blockEnd = close(at);
                if (loopEnd > 0 && blockEnd === loopEnd + 1 && code[loopEnd - 2] === BR && code[loopEnd - 1] === 0) {
                    // C: from the loop body's start to the first top-level `eqz; br_if 1`.
                    let depth = 0, k = at + 4, condEnd = -1, internal = true;
                    for (; k < loopEnd; k = next(k)) {
                        const op = code[k];
                        if (depth === 0 && op === I32_EQZ && code[k + 1] === BR_IF && code[k + 2] === 1) { condEnd = k; break; }
                        if (op >= BLOCK && op <= IF) depth++;
                        else if (op === END) depth--;
                        else if ((op === BR || op === BR_IF) && code[k + 1] >= depth) internal = false;
                        else if (op === RETURN || op === UNREACHABLE) internal = false;
                    }
                    if (condEnd > 0 && internal) {
                        const cond = code.slice(at + 4, condEnd);
                        out.push(BLOCK, VOID, ...cond, I32_EQZ, BR_IF, 0, LOOP, VOID);
                        emit(condEnd + 3, loopEnd - 2, out);
                        out.push(...cond, BR_IF, 0, END, END);
                        changed = true;
                        at = blockEnd + 1;
                        continue;
                    }
                }
            }
            const n = next(at);
            for (let j = at; j < n; j++) out.push(code[j]);
            at = n;
        }
    }
    for (let at = 0; at < code.length; at = next(at)) if (CELLS[code[at]] < 0) return null;
    const out = [];
    emit(0, code.length, out);
    return changed ? out : null;
}

// rv32/passes/fields.js
// The fields pass: an f32 field that a function reads more than once is loaded once.

// `get r; f32.load a off` reads the same value every time when r is a parameter the function never writes and nothing
// in the function stores to memory or calls a function that may (storeless). The first read of each (r, off) at the
// function's top level, outside every block, runs before any later operation, so it becomes
// `get r; f32.load a off; set t; get t` and every later read `get t`, for a fresh f32 local t. Integer loads stay as
// they are: their images are pinned (PICOCALC-TYPED-F32; widening this to i32.load is a separate measurement).
function reuseFloatFields(fn, storeless) {
    const code = fn.code, params = fn.params.length;
    if (!code.includes(F32_LOAD)) return null;
    const written = new Set(), firsts = new Map(), count = new Map();
    let depth = 0;
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (!(CELLS[op] >= 0)) return null;
        if (EFFECTS[op] & STORES) return null;
        if (op === CALL && !storeless(code[at + 1])) return null;
        if (op === LOCAL_SET) written.add(code[at + 1]);
        if (op >= BLOCK && op <= IF) depth++;
        else if (op === END) depth--;
        if (op === LOCAL_GET && code[at + 1] < params && code[at + 2] === F32_LOAD) {
            const key = code[at + 1] * 4096 + code[at + 4];
            count.set(key, (count.get(key) ?? 0) + 1);
            if (!firsts.has(key)) firsts.set(key, depth === 0 ? at : -1);
        }
    }
    const reused = new Map();
    let fresh = params + fn.nlocals;
    for (const [key, at] of firsts)
        if (at >= 0 && count.get(key) > 1 && !written.has(Math.floor(key / 4096)) && code[at + 4] < 4096) reused.set(key, {at, local: fresh++});
    if (!reused.size) return null;
    const out = [];
    for (let at = 0; at < code.length;) {
        const next = opNext(code, at);
        if (code[at] === LOCAL_GET && code[at + 2] === F32_LOAD) {
            const hit = reused.get(code[at + 1] * 4096 + code[at + 4]);
            if (hit) {
                if (hit.at === at) out.push(LOCAL_GET, code[at + 1], F32_LOAD, code[at + 3], code[at + 4], LOCAL_SET, hit.local);
                out.push(LOCAL_GET, hit.local);
                at = opNext(code, next);
                continue;
            }
        }
        for (let k = at; k < next; k++) out.push(code[k]);
        at = next;
    }
    const localTypes = (fn.localTypes ?? Array(fn.nlocals).fill("i32")).slice();
    for (let i = fn.nlocals; i < fresh - params; i++) localTypes[i] = "f32";
    return {code: out, nlocals: fresh - params, localTypes};
}

// rv32/passes/inline-group.js
// The "inline" group (typed-rv32-inline.js): inline, commute and rotate, the passes "balanced" adds to the
// core. Loading this module installs them in the registry.

installPasses("inline", {
    inline: {
        setup(unit) {
            unit.inlining = {...INLINE_DEFAULTS, ...unit.options.inline};
            unit.inlineLibrary = new Map();
        },
        // inlineCalls: the function's own code inlines the candidate calls in its loops; the library copy, kept
        // for later callers, inlines every candidate call. Expansion only grows a tape, so a function already
        // over the callee limit is never a library candidate and needs no fully expanded copy.
        run(fn, ctx) {
            const {inlining, inlineLibrary, arity} = ctx;
            const all = fn.code.length <= inlining.calleeCells ? inlineCalls(fn, inlineLibrary, inlining, arity, true) : null;
            ctx.libraryCopy = all ?? {code: fn.code, nlocals: fn.nlocals, localTypes: fn.localTypes};
            const loops = inlineCalls(fn, inlineLibrary, inlining, arity, false);
            if (loops) {
                fn.code = loops.code;
                fn.nlocals = loops.nlocals;
                if (loops.localTypes) fn.localTypes = loops.localTypes;
            }
        },
        // After emission (a guarded-return summary, which the emitter's stages may set, excludes a candidate):
        // the library copy of an inlinable function joins the library.
        finishName: "candidate",
        finish(fn, ctx) {
            const {inlining, inlineLibrary, libraryCopy, index} = ctx;
            const candidate = inlineCandidate(fn, libraryCopy.code, inlining, ctx.targets[index]?.guardedReturn);
            if (candidate) inlineLibrary.set(index, {...candidate, nlocals: libraryCopy.nlocals, code: libraryCopy.code.slice(),
                loops: loopDepth(libraryCopy.code), types: inlineTypes(fn, libraryCopy)});
            inlining.report?.push({name: fn.name, cells: fn.code.length, locals: fn.params.length + fn.nlocals,
                libraryCells: candidate ? libraryCopy.code.length : undefined});
        },
    },
    // A function's storeless answer is computed from its tape before any pass rewrites it (as for hoist), here only for
    // the functions the pass may rewrite or call: those with f32 values (an integer program pays nothing).
    fields: {startName: "storeless", start(fn, ctx) { if (fn.code.includes(F32_LOAD) || floatingFunction(fn)) ctx.storeless(ctx.index); }, run(fn, ctx) {
        const reused = reuseFloatFields(fn, ctx.storeless);
        if (reused) Object.assign(fn, reused);
    }},
    commute: {run: (fn, ctx) => replaceTape(fn, commuteConstants(fn.code, ctx.arity))},
    rotate: {run: fn => replaceTape(fn, rotateLoops(fn.code))},
});
// A marker for loaders that list what a realm holds (the trace-REPL workbench's module table).
globalThis.typedRv32Inline = {group: "inline"};
})();
