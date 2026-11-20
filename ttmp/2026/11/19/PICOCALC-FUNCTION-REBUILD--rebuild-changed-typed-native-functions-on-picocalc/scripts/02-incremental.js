/* The staged frontend and backend expose the frozen compiler's ordinary implementations. */
(() => {
"use strict";

const {Lexer, RebuildEmitter, rebuildRecords, recordLayouts} = rebuildFrontend;
const {FunctionCode, jump, linkSlot} = rebuildBackend;

function signature(fn) {
    return JSON.stringify([fn.imported, fn.params, fn.result]);
}

function layoutsByName(records) {
    return new Map(Array.from(records, ([name, fields]) => [name, JSON.stringify([...fields])]));
}

function observed(table, facts, fingerprints, presence) {
    return {
        get(name) {
            facts.set(name, fingerprints.get(name));
            return table.get(name);
        },
        has(name) {
            const exists = table.has(name);
            presence.set(name, exists);
            return exists;
        },
    };
}

function agrees(facts, current) {
    for (const [name, fingerprint] of facts) {
        if (fingerprint !== current.get(name)) return false;
    }
    return true;
}

function stillPresent(facts, records) {
    for (const [name, existed] of facts) {
        if (existed !== records.has(name)) return false;
    }
    return true;
}

function checkJump(rd, delta) {
    if (!Number.isInteger(delta) || delta < -1048576 || delta > 1048574)
        throw new SyntaxError("RV32 jump exceeds the instruction range");
    return jump(rd, delta) >>> 0;
}

function fragment(fn, callables) {
    const code = new FunctionCode(fn, callables, callables).lower();
    const words = Uint32Array.from(code.words);
    const calls = [];
    for (const {from, target, rd} of code.calls) {
        if (target.name === undefined) {
            words[from] = checkJump(rd, 4 * (target.at - from));
        } else {
            calls.push({at: from * 4, name: target.name, rd});
        }
    }
    return {words, calls};
}

function assemble(functions, declared, records, importCount, details) {
    const entries = Object.create(null);
    let size = 0;
    for (const {fn, piece} of functions) {
        entries[fn.name] = size;
        size += piece.words.byteLength;
    }
    const image = new Uint8Array(size);
    const view = new DataView(image.buffer);
    const relocations = [];
    const jumps = [];
    for (const {fn, piece} of functions) {
        const start = entries[fn.name];
        for (let i = 0; i < piece.words.length; i++)
            view.setUint32(start + 4 * i, piece.words[i], true);
        for (const {at, name, rd} of piece.calls) {
            const from = start + at;
            const target = declared.get(name);
            if (target.imported) {
                relocations.push({offset: from, index: target.index});
            } else {
                const to = entries[name];
                const word = checkJump(rd, to - from);
                view.setUint32(from, word, true);
                if (details) jumps.push({caller: fn.name, target: name, from, to, word});
            }
        }
    }
    return {image, entries, records: recordLayouts(records), relocations, importCount,
        signatures: functions.map(({fn: {name, params, result}}) => ({name, params, result})), jumps};
}

function measure(clock) {
    const phases = {walk: 0, body: 0, lower: 0, assemble: 0, validate: 0, link: 0, publish: 0, fallback: 0, exact: 0};
    if (!clock) return {phases, mark() {}};
    let at = clock();
    return {phases, mark(phase) {
        const now = clock();
        phases[phase] += now - at;
        at = now;
    }};
}

function compile(source, profile, previous, mark, details) {
    if (source.length > profile.maxSourceLength) throw new SyntaxError("input limit exceeded");
    const lex = new Lexer(source);
    const records = rebuildRecords(lex);
    const layouts = layoutsByName(records);
    const callables = profile.imports.map((fn, index) => ({...fn, index, imported: true}));
    const declared = new Map(callables.map(fn => [fn.name, fn]));
    const signatures = new Map(callables.map(fn => [fn.name, signature(fn)]));
    const functions = [];
    const items = new Map();
    const reused = [], built = [];
    while (lex.token.kind !== "eof") {
        const start = lex.token.at;
        const called = new Map(), touched = new Map(), presence = new Map();
        const emitter = new RebuildEmitter(lex, observed(declared, called, signatures),
            observed(records, touched, layouts, presence));
        const header = emitter.header();
        const prior = previous?.get(header.name);
        let reason;
        if (!prior || !source.startsWith(prior.text, start)) reason = "source";
        else if (!agrees(prior.called, signatures)) reason = "signature";
        else if (!agrees(prior.touched, layouts) || !stillPresent(prior.presence, records)) reason = "layout";

        let piece;
        if (reason) {
            mark("walk");
            const fn = emitter.body(header);
            mark("body");
            piece = {text: source.slice(start, fn.end), called, touched, presence, ...fragment(fn, callables)};
            mark("lower");
            built.push({name: header.name, reason});
        } else {
            // Retain the production lexer state at the exact closing brace boundary.
            lex.offset = start + prior.text.length;
            lex.next();
            piece = prior;
            reused.push(header.name);
        }
        if (header.name === "memory") lex.fail("reserved memory export");
        if (declared.has(header.name)) lex.fail("duplicate function " + header.name);
        const binding = {...header, index: callables.length, imported: false};
        callables.push(binding);
        declared.set(binding.name, binding);
        signatures.set(binding.name, signature(binding));
        functions.push({fn: header, piece});
        items.set(header.name, piece);
    }
    if (!functions.length) lex.fail("expected a function");
    mark("walk");
    const program = assemble(functions, declared, records, profile.imports.length, details);
    mark("assemble");
    profile.validate(program);
    mark("validate");
    return {program, items, reused, built};
}

// A session owns its reactor and its last successful revision. Callers can retain
// opaque revision identities and mutate returned bytes without affecting reuse.
globalThis.createFunctionRebuild = function(profile, reactor) {
    const runtime = new Uint8Array(reactor);
    const contract = {...profile, entries: profile.entries.slice(),
        imports: profile.imports.map(fn => ({...fn, params: fn.params.slice()}))};
    let current;
    function publish(source, items, bytes) {
        current = {source, items, bytes: new Uint8Array(bytes), revision: Object.freeze({})};
        return current.revision;
    }
    return {
        get revision() { return current?.revision; },
        build(source, {parent = current?.revision, exact = true, clock, details = false} = {}) {
            const {mark, phases} = measure(clock);
            let priorFailure;
            if (parent === current?.revision) {
                if (exact && current && source === current.source) {
                    const bytes = new Uint8Array(current.bytes);
                    mark("exact");
                    return {bytes, mode: "exact", phases, revision: current.revision};
                }
                try {
                    const {program, items, reused, built} = compile(source, contract, current?.items, mark, details);
                    const bytes = linkSlot(program, runtime, contract.entries);
                    mark("link");
                    const revision = publish(source, items, bytes);
                    mark("publish");
                    return {bytes, mode: "fragments", reused, built, instructionBytes: program.image.length,
                        ...(details ? {entries: program.entries, jumps: program.jumps} : {}), phases, revision};
                } catch (error) {
                    priorFailure = error.name + ": " + error.message;
                    mark("walk");
                }
            } else {
                priorFailure = "stale revision";
                mark("walk");
            }

            // The frozen compiler controls diagnostics and can recover from an
            // unsupported fast route. Publish only after full link success.
            try {
                const bytes = contract.clean(source, runtime);
                mark("fallback");
                const revision = publish(source, null, bytes);
                mark("publish");
                return {bytes, mode: "fallback", reason: priorFailure, phases, revision};
            } catch (error) {
                mark("fallback");
                return {error: {name: error.name, message: error.message}, mode: "rejected",
                    reason: priorFailure, phases, revision: current?.revision};
            }
        },
    };
};
})();
