function compile(source, imports = [], maxSourceLength, requested) {
    const options = resolveOptions(requested);
    const imported = imports.map((fn, index) => ({...fn, index}));
    const targets = imported.map(fn => ({importIndex: fn.index}));
    const callables = imported.slice();
    const code = [];
    // A function stores nothing when its tape has no store and calls only such functions.
    // Imports and functions not yet declared are assumed to store. A lowered function's tape is
    // released (consume), so lower() records the answer for each function first.
    const storelessMemo = new Map();
    function storeless(index) {
        if (storelessMemo.has(index)) return storelessMemo.get(index);
        storelessMemo.set(index, false);
        const tape = index >= imported.length ? callables[index]?.code : undefined;
        let result = Boolean(tape);
        for (let at = 0; result && at < tape.length; at = opNext(tape, at)) {
            const op = tape[at];
            if (!(OPERAND_CELLS[op] >= 0) || op === 0x36 || op === 0x3b || op === 0xf2) result = false;
            else if (op === 0x10) result = storeless(tape[at + 1]);
        }
        storelessMemo.set(index, result);
        return result;
    }
    function declare(functions) {
        for (const fn of functions) {
            targets.push({global: true});
            callables.push(fn);
        }
    }

    const inspect = options?.inspect;
    const policy = options?.inlineGuardedReturns;
    const inlining = options?.inline ? {...INLINE_DEFAULTS, ...(options.inline === true ? {} : options.inline)} : null;
    const inlineLibrary = new Map();
    if (policy !== undefined && typeof policy !== "boolean" && typeof policy !== "function")
        throw new TypeError("expected a boolean or caller selector for inlineGuardedReturns");
    function lower(fn) {
        if (options?.select?.hoist) storeless(imported.length + code.length);
        if (inspect && (inspect.function === undefined || inspect.function === fn.name))
            fn.nativeInspection = {leafDecision: "eligible for frameless lowering"};
        let libraryCopy;
        if (inlining) {
            const arity = index => callables[index].params.length;
            // The library copy inlines every candidate call; the function's own code only those
            // in its loops.
            // Expansion only grows a tape, so a function already over the callee limit is
            // never a library candidate and needs no fully expanded copy.
            const all = fn.code.length <= inlining.calleeCells ? inlineCalls(fn, inlineLibrary, inlining, arity, true) : null;
            libraryCopy = all ?? {code: fn.code, nlocals: fn.nlocals};
            const loops = inlineCalls(fn, inlineLibrary, inlining, arity, false);
            if (loops) {
                fn.code = loops.code;
                fn.nlocals = loops.nlocals;
            }
        }
        let Emitter = FunctionCode;
        if (policy) {
            // Only our internal definition targets can acquire summaries. A forward call
            // uses the ordinary ABI in both streaming and buffered compilation.
            const summary = guardedReturnSummary(fn);
            if (summary) targets[imported.length + code.length].guardedReturn = summary;
            if (policy === true || policy(fn.name)) Emitter = GuardedReturnCode;
        }
        const mode = options?.pieLoops;
        if (mode !== undefined) {
            if (mode !== "scalar" && mode !== "pie" && mode !== "pie-empty" && typeof mode !== "function") throw new TypeError("unknown PIE loop compilation mode");
            if (!globalThis.typedPieLoops) throw new Error("load typed-pie-loops.js for PIE loop compilation");
            const selected = typedPieLoops.lower(fn, callables, targets, mode, Emitter, instruction);
            if (selected) {
                code.push(selected);
                if (fn.literals) fn.literals = null;
                return;
            }
        }
        // observeTape(name, phase, code, nlocals): a read-only view of each tape transform, for
        // tools (the trace-REPL workbench). It sees a copy and cannot change the output.
        const observe = phase => options?.observeTape?.(fn.name, phase, fn.code.slice(), fn.nlocals);
        observe("inline");
        if (options?.select?.commute) {
            const commuted = commuteConstants(fn.code, index => callables[index].params.length);
            if (commuted) fn.code = commuted;
            observe("commute");
        }
        const arity = index => callables[index].params.length;
        if (options?.select?.conjunctions) {
            const fused = fuseConjunctions(fn.code);
            if (fused) fn.code = fused;
            observe("conjunctions");
        }
        if (options?.select?.sets) {
            const folded = foldValueSets(fn.code, arity);
            if (folded) fn.code = folded;
            observe("sets");
        }
        let ranges;
        if (options?.select?.rotate) {
            const rotated = rotateLoops(fn.code);
            if (rotated) fn.code = rotated;
            observe("rotate");
            if (options.select.facts) ranges = localRanges(fn.code, fn.params.length, arity);
            if (options.select.version) {
                const hoist = options.select.hoist ? {storeless, arity, fresh: () => fn.params.length + fn.nlocals++} : undefined;
                const versioned = versionLoops(fn.code, fn.params.length, hoist, options.select.induction);
                if (versioned) fn.code = versioned;
                observe("version");
            }
        }
        if (options?.select?.facts && !options.select.rotate) ranges = localRanges(fn.code, fn.params.length, arity);
        let origin = local => local;
        if (options?.operandLocations?.split) {
            const before = fn.params.length + fn.nlocals;
            const split = splitLocals(fn.code, fn.params.length, fn.nlocals);
            if (split) {
                fn.code = split.code;
                fn.nlocals = split.nlocals;
                origin = local => local >= before ? split.origin[local - before] : local;
            }
            observe("split");
        }
        const facts = ranges ? divisionFacts(fn.code, fn.params.length, arity, ranges, origin) ?? undefined : undefined;
        let compiled = lowerLeaf(fn, callables, targets, options?.select, facts);
        if (!compiled) {
            const plan = options?.operandLocations ? planLocations(fn, {...options.operandLocations, select: options.select},
                index => Emitter === GuardedReturnCode && targets[index]?.guardedReturn) : undefined;
            // observePlan(name, plan): a read-only view of the operand-location plan, for tools.
            if (plan) options?.observePlan?.(fn.name, plan);
            const emit = longBranches => {
                const emitter = new Emitter(fn, callables, targets);
                emitter.select = options?.select;
                emitter.facts = facts;
                emitter.longBranches = longBranches;
                if (plan !== undefined) emitter.locations = plan;
                return emitter.lower();
            };
            try {
                compiled = emit(false);
            } catch (error) {
                if (error !== SHORT_BRANCH_RANGE) throw error;
                compiled = emit(true);
            }
        }
        const index = imported.length + code.length;
        const candidate = inlining && inlineCandidate(fn, libraryCopy.code, inlining, targets[index]?.guardedReturn);
        if (candidate) inlineLibrary.set(index, {...candidate, nlocals: libraryCopy.nlocals, code: libraryCopy.code.slice(),
            loops: loopDepth(libraryCopy.code)});
        inlining?.report?.push({name: fn.name, cells: fn.code.length, locals: fn.params.length + fn.nlocals,
            libraryCells: candidate ? libraryCopy.code.length : undefined});
        code.push(compiled);
        // The lowered code retains the descriptor, so release the function-local literal table.
        if (fn.literals) fn.literals = null;
    }

    let lowerError;
    function consume(fn) {
        // Buffered compilation checks the entire source before reporting a backend error.
        if (!lowerError) {
            try { lower(fn); } catch (error) { lowerError = error; }
        }
        // FunctionCode retains the function descriptor until assembly.
        fn.code = null;
    }

    const stream = options?.streamFunctions ?? true;
    const {functions, records, enums, distinct, asyncLayout, asyncSource} = typedWasm.compileFunctions(source,
        imported.length, imported, maxSourceLength, true, stream ? consume : undefined, declare, options);
    if (lowerError) throw lowerError;
    if (!stream) {
        for (const fn of functions) lower(fn);
    }
    let words = 0;
    for (let i = 0; i < code.length; i++) {
        targets[imported.length + i].at = words;
        words += code[i].words.length;
    }
    const image = new Uint8Array(words * 4);
    const view = new DataView(image.buffer);
    const entries = Object.create(null);
    const relocations = [];
    for (let i = 0; i < code.length; i++) {
        const start = targets[imported.length + i].at;
        const fn = code[i];
        entries[functions[i].name] = start * 4;
        for (const {from, target, rd} of fn.calls) {
            if (target.importIndex !== undefined) {
                relocations.push({offset: 4 * (start + from), index: target.importIndex});
                continue;
            }
            const delta = 4 * (target.at - from - (target.global ? start : 0));
            if (!Number.isInteger(delta) || delta < -1048576 || delta > 1048574)
                throw new SyntaxError("RV32 jump exceeds the instruction range");
            fn.words[from] = instruction.j(rd, delta) >>> 0;
        }
        for (let j = 0; j < fn.words.length; j++) view.setUint32(4 * (start + j), fn.words[j], true);
        if (fn.program.nativeInspection) nativeEmission(fn, start * 4, inspect);
    }
    return {image, entries, records: typedWasm.recordLayouts(records), enums: typedWasm.enumLayouts(enums),
        distinct: [...distinct], relocations, importCount: imports.length,
        signatures: functions.map(({name, params, result}) => ({name, params, result})),
        ...(asyncLayout && {asyncLayout}), ...(asyncSource && {asyncSource})};
}

// The bundled, already linked SDK reactor reserves this area in executable
// text. The native world loader still validates and relocates the completed ELF.
function linkSlot(program, runtime, entries) {
    const magic = [0x4147454e, 0x44415256, 0x3332534c];
    const headerBytes = 20;
    const importOffset = headerBytes + 4 * entries.length;
    const codeOffset = importOffset + 4 * program.importCount;
    const view = new DataView(runtime.buffer, runtime.byteOffset, runtime.byteLength);
    if (runtime.length < 52 || view.getUint32(0, true) !== 0x464c457f ||
        view.getUint8(4) !== 1 || view.getUint8(5) !== 1 ||
        view.getUint16(16, true) !== 3 || view.getUint16(18, true) !== 243 ||
        (view.getUint32(36, true) & 6) !== 2)
        throw new SyntaxError("expected an ELF32 RISC-V ilp32f reactor");
    const count = view.getUint16(44, true);
    const stride = view.getUint16(42, true);
    const segments = view.getUint32(28, true);
    if (stride !== 32 || segments + stride * count > runtime.length)
        throw new SyntaxError("invalid RV32 reactor program headers");

    let slot = -1, capacity = 0;
    for (let i = 0; i < count; i++) {
        const header = segments + i * stride;
        if (view.getUint32(header, true) !== 1 || !(view.getUint32(header + 24, true) & 1)) continue;
        const start = view.getUint32(header + 4, true);
        const end = start + view.getUint32(header + 16, true);
        if (end > runtime.length) throw new SyntaxError("truncated RV32 reactor code segment");
        for (let at = (start + 3) & -4; at + codeOffset <= end; at += 4) {
            if (view.getUint32(at, true) !== magic[0] || view.getUint32(at + 4, true) !== magic[1] ||
                view.getUint32(at + 8, true) !== magic[2]) continue;
            if (slot >= 0) throw new SyntaxError("ambiguous RV32 reactor slot");
            capacity = view.getUint32(at + 12, true);
            if (view.getUint32(at + 16, true) !== entries.length + 65536 * program.importCount || capacity < codeOffset ||
                capacity > end - at || capacity > 1048576 || capacity % 4)
                throw new SyntaxError("invalid RV32 reactor slot header");
            for (let entry = at + headerBytes; entry < at + importOffset; entry += 4) {
                if (view.getUint32(entry, true) !== 0x00100073)
                    throw new SyntaxError("invalid RV32 reactor entry stub");
            }
            for (let entry = at + importOffset; entry < at + codeOffset; entry += 4) {
                if ((view.getUint32(entry, true) & 0xfff) !== 0x6f)
                    throw new SyntaxError("invalid RV32 runtime import trampoline");
            }
            slot = at;
            at += capacity - 4;
        }
    }
    if (slot < 0) throw new SyntaxError("missing RV32 reactor slot");
    if (program.image.length > capacity - codeOffset) throw new SyntaxError("RV32 program does not fit the reactor slot");
    const bytes = new Uint8Array(runtime);
    const patched = new DataView(bytes.buffer);
    for (let i = 0; i < entries.length; i++) {
        const offset = program.entries[entries[i]];
        if (!Number.isInteger(offset) || offset < 0 || offset + 4 > program.image.length || offset % 4)
            throw new SyntaxError("invalid RV32 entry " + entries[i]);
        const stub = headerBytes + 4 * i;
        patched.setUint32(slot + stub, instruction.j(ZERO, codeOffset + offset - stub), true);
    }
    bytes.set(program.image, slot + codeOffset);
    for (const {offset, index} of program.relocations) {
        const call = codeOffset + offset;
        patched.setUint32(slot + call, instruction.j(RA, importOffset + 4 * index - call), true);
    }
    return bytes;
}

globalThis.typedRv32 = {compile, linkSlot, policies: POLICIES};
