// compile: the front end's functions, one at a time, through the policy's pipeline to RV32 words, then the
// image's layout and relocations.
import {instruction} from "./encoding/registers.js";
import {encoder} from "./encoding/instructions.js";
import {FunctionCode} from "./emit/function-code.js";
import {GuardedReturnCode, guardedReturnSummary} from "./emit/guarded-return.js";
import {lowerLeaf} from "./emit/leaf-code.js";
import {SHORT_BRANCH_RANGE} from "./emit/branches.js";
import {nativeEmission} from "./emit/inspection.js";
import {planLocations} from "./plan/locations.js";
import {storelessAnalysis} from "./analysis/storeless.js";
import {PASSES, loadPasses} from "./passes/registry.js";
import {resolveOptions} from "./policy.js";

// Per function, the stages before the emitter run in this order: the policy's passes in registry order, with
// three stages that are not tape passes after inline: the guarded-return summary (inlineGuardedReturns), the
// PIE lowering (pieLoops, which may take the whole function) and the "inline" checkpoint, where observeTape
// sees the tape that enters the other passes. Then lowerLeaf, or planLocations and FunctionCode; then each
// pass's finish.
export function compile(source, imports = [], maxSourceLength, requested) {
    const options = resolveOptions(requested);
    loadPasses(options.passes);
    const imported = imports.map((fn, index) => ({...fn, index}));
    const targets = imported.map(fn => ({importIndex: fn.index}));
    const callables = imported.slice();
    const code = [];
    function declare(functions) {
        for (const fn of functions) {
            targets.push({global: true});
            callables.push(fn);
        }
    }

    const inspect = options?.inspect;
    const guarded = options?.inlineGuardedReturns;
    if (guarded !== undefined && typeof guarded !== "boolean" && typeof guarded !== "function")
        throw new TypeError("expected a boolean or caller selector for inlineGuardedReturns");
    const mode = options?.pieLoops;
    if (mode !== undefined) {
        if (mode !== "scalar" && mode !== "pie" && mode !== "pie-empty" && typeof mode !== "function") throw new TypeError("unknown PIE loop compilation mode");
        if (!globalThis.typedPieLoops) throw new Error("load typed-pie-loops.js for PIE loop compilation");
    }
    const passes = new Set(options.passes);
    const chosen = PASSES.filter(pass => passes.has(pass.name));
    // arity(index): a callee's parameter count (a value record parameter counts its leaves); arity.results(index): the
    // values its call pushes (a record result's leaves, else one). Passes with an abstract operand stack use both.
    const arity = index => callables[index].params.length;
    arity.results = index => callables[index].results?.length ?? 1;
    const unit = {options, callables, targets, arity,
        storeless: storelessAnalysis(callables, imported.length)};
    for (const pass of chosen) pass.setup?.(unit);
    const starts = chosen.filter(pass => pass.start);
    const finishes = chosen.filter(pass => pass.finish);
    const stages = chosen.filter(pass => pass.run);
    const inlined = stages[0]?.name === "inline" ? [stages.shift()] : [];
    if (guarded) inlined.push({name: "guarded", run(fn, ctx) {
        // Only our internal definition targets can acquire summaries. A forward call
        // uses the ordinary ABI in both streaming and buffered compilation.
        const summary = guardedReturnSummary(fn);
        if (summary) targets[ctx.index].guardedReturn = summary;
        if (guarded === true || guarded(fn.name)) ctx.Emitter = GuardedReturnCode;
    }});
    if (mode !== undefined) inlined.push({name: "pie", terminal: true,
        run: (fn, ctx) => typedPieLoops.lower(fn, callables, targets, mode, ctx.Emitter, encoder)});
    stages.unshift(...inlined, {name: "inline", checkpoint: true});

    // timing: an array that receives {fn, pass, ms, cells} for every stage a function runs (cells: the
    // tape's length after it), plus one {fn: null, pass: "compile", ms} row for the whole call. The
    // clock is options.clock, performance.now or Date.now; it is read only when timing is given.
    const timing = options?.timing;
    const clock = options?.clock ?? (globalThis.performance ? () => performance.now() : Date.now);
    function time(fn, pass, run) {
        if (!timing) return run();
        const start = clock();
        const result = run();
        timing.push({fn: fn.name, pass, ms: clock() - start, cells: fn.code ? fn.code.length : 0});
        return result;
    }
    function lower(fn) {
        const index = imported.length + code.length;
        const ctx = Object.assign(Object.create(unit), {passes, index, Emitter: FunctionCode, origin: local => local});
        for (const pass of starts) time(fn, pass.startName ?? pass.name, () => pass.start(fn, ctx));
        if (inspect && (inspect.function === undefined || inspect.function === fn.name))
            fn.nativeInspection = {leafDecision: "eligible for frameless lowering"};
        // observeTape(name, phase, code, nlocals): a read-only view of the tape after each transform, for
        // tools (the trace-REPL workbench). It sees a copy and cannot change the output.
        const observe = phase => options?.observeTape?.(fn.name, phase, fn.code.slice(), fn.nlocals);
        for (const stage of stages) {
            if (stage.checkpoint) {
                observe(stage.name);
                continue;
            }
            const lowered = time(fn, stage.name, () => stage.run(fn, ctx));
            if (stage.terminal && lowered) {
                code.push(lowered);
                if (fn.literals) fn.literals = null;
                return;
            }
            if (stage.kind === "transform" && stage.observe !== false) observe(stage.name);
        }
        const {Emitter, facts} = ctx;
        let compiled = time(fn, "leaf", () => lowerLeaf(fn, callables, targets, options?.select, facts));
        if (!compiled) {
            const plan = options?.operandLocations ? time(fn, "plan", () => planLocations(fn, {...options.operandLocations, select: options.select},
                index => Emitter === GuardedReturnCode && targets[index]?.guardedReturn)) : undefined;
            // observePlan(name, plan): a read-only view of the operand-location plan, for tools.
            if (plan) options?.observePlan?.(fn.name, plan);
            const emit = (longBranches, frameless) => {
                const emitter = new Emitter(fn, callables, targets);
                if (frameless) emitter.frameless = true;
                emitter.select = options?.select;
                emitter.versioned = passes.has("version");
                emitter.facts = facts;
                emitter.longBranches = longBranches;
                if (plan !== undefined) emitter.locations = plan;
                return emitter.lower();
            };
            compiled = time(fn, "emit", () => {
                let longBranches = false;
                const lowered = frameless => {
                    try {
                        return emit(longBranches, frameless);
                    } catch (error) {
                        if (error !== SHORT_BRANCH_RANGE) throw error;
                        longBranches = true;
                        return emit(true, frameless);
                    }
                };
                // An f32 function that used no frame is emitted again without one (FunctionCode.dropsFrame).
                const code = lowered(false);
                return code.dropsFrame ? lowered(true) : code;
            });
        }
        for (const pass of finishes) time(fn, pass.finishName ?? pass.name, () => pass.finish(fn, ctx));
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

    const started = timing ? clock() : 0;
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
    if (timing) timing.push({fn: null, pass: "compile", ms: clock() - started, cells: 0});
    return {image, entries, records: typedWasm.recordLayouts(records), enums: typedWasm.enumLayouts(enums),
        distinct: [...distinct], relocations, importCount: imports.length,
        signatures: functions.map(typedWasm.publicSignature),
        ...(asyncLayout && {asyncLayout}), ...(asyncSource && {asyncSource})};
}
