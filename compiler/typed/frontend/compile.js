// The front end's entry: compileFunctions parses a program and hands each function's tape to the backend
// before parsing the next (streaming), with the async rewrite (typed-async.js) when the source needs it.
// Parse and check `source`, writing each function's tape (fn.code, fn.nlocals, fn.literals) and handing it to
// onFunction before the next function is parsed. The fifth parameter is unused: the front end has one output.
function compileFunctions(source, functionBase, imported = [], maxSourceLength = 64 * 1024, unused, onFunction, onSignatures, options) {
    if (source.length > maxSourceLength) throw new SyntaxError("input limit exceeded");
    const inspect = options?.inspect;
    if (inspect && typeof inspect.emit !== "function") throw new TypeError("Typed inspection needs an emit callback");
    return withLexIndices(() => {
        const lowered = globalThis.typedAsync?.rewrite(source, imported);
        try {
            const program = lowered
                ? emitSpanFunctions(lowered, functionBase, imported, onFunction, onSignatures, inspect)
                : emitFunctions(source, functionBase, imported, onFunction, onSignatures, undefined, inspect);
            if (lowered) {
                program.asyncLayout = lowered.layout;
                if (options?.asyncSource) program.asyncSource = lowered.source;
            }
            return program;
        } catch (error) {
            if (error instanceof InspectionCallbackError) throw error.cause;
            if (!lowered || !(error instanceof SyntaxError)) throw error;
            lexicalScope?.sources.clear();
            try {
                emitFunctions(lowered.source, functionBase, imported, undefined, undefined, lowered);
            } catch (canonical) {
                throw lowered.remap(canonical);
            }
            throw new Error("span emitter rejected the canonical program", {cause: error});
        }
    });
}

function configureGeneratedLexer(lex, lowered) {
    const generatedPrefix = lowered.prefix;
    lex.isGeneratedLocal = name => name.startsWith(generatedPrefix + "local_");
    lex.generatedWordType = name => name.startsWith(generatedPrefix + "word_")
        ? name.slice(generatedPrefix.length + "word_".length) : null;
    lex.generatedStartFields = lowered.startFields;
    return lex;
}

function emitSpanFunctions(lowered, functionBase, imported, onFunction, onSignatures, inspect) {
    const {original, declarations, fields, bodies, generated} = lowered.plan;
    const {enums, distinct, aliases} = declarations;
    const records = new Map(declarations.records);
    if (fields.length) {
        const state = new Map(records.get("WorldState"));
        for (const {name, type} of fields) state.set(name, {type, offset: state.size * 4});
        records.set("WorldState", state);
    }
    const declared = new Map(imported.map(fn => [fn.name, fn]));
    for (const name of distinct)
        if (declared.has(name)) throw new SyntaxError("duplicate imported function " + name);

    const functions = lowered.ordinarySignatures.slice();
    for (const [ordinal, fn] of functions.entries()) {
        fn.index = functionBase + ordinal;
        declared.set(fn.name, fn);
    }
    const originalLex = configureGeneratedLexer(new Lexer(original, 0, original.length, true), lowered);
    const generatedLex = configureGeneratedLexer(new Lexer(generated, 0, generated.length, true), lowered);
    const ordinaryCount = functions.length;
    for (const fn of scanSignatures(generatedLex, records, declared, functionBase + ordinaryCount, enums, distinct)) {
        fn.bodyAt += lowered.generatedAt;
        functions.push(fn);
    }
    if (!functions.length) throw new SyntaxError("expected a function");
    checkMembers(originalLex, aliases, declared, records);
    if (onSignatures) onSignatures(functions);
    const edges = functions.map(() => []);
    for (const [i, fn] of functions.entries()) {
        const virtualAt = fn.bodyAt;
        let lex = originalLex;
        if (i >= ordinaryCount) {
            lex = generatedLex;
            fn.bodyAt -= lowered.generatedAt;
        } else {
            const body = bodies[i];
            if (body.text !== undefined) lex = configureGeneratedLexer(new Lexer(body.text, 0, body.text.length, true), lowered);
            fn.bodyAt = body.at;
        }
        try {
            const emitter = new FunctionEmitter(lex, declared, records, edges[i], functionBase, enums, distinct, aliases);
            if (inspect) finishFunction(emitter, fn, inspect,
                lex === originalLex ? undefined : lex === generatedLex ? "synthetic-source" : "rewritten-body");
            else emitter.function(fn);
        } finally {
            fn.bodyAt = virtualAt;
        }
        if (onFunction) onFunction(fn);
    }
    return {functions, records, enums, distinct, edges, order: checkAcyclic(functions, edges)};
}

function emitFunctions(source, functionBase, imported, onFunction, onSignatures, lowered, inspect) {
    const lex = new Lexer(source, 0, source.length, true);
    if (lowered) {
        const generatedPrefix = lowered.prefix;
        lex.isGeneratedLocal = name => name.startsWith(generatedPrefix + "local_");
        lex.generatedWordType = name => name.startsWith(generatedPrefix + "word_")
            ? name.slice(generatedPrefix.length + "word_".length) : null;
        lex.generatedStartFields = lowered.startFields;
    }
    const declared = new Map(imported.map(fn => [fn.name, fn]));
    const {records, enums, distinct, aliases} = parseDeclarations(lex);
    for (const name of distinct) if (declared.has(name)) lex.fail("duplicate imported function " + name);
    const functions = scanSignatures(lex, records, declared, functionBase, enums, distinct);
    if (!functions.length) lex.fail("expected a function");
    checkMembers(lex, aliases, declared, records);
    if (onSignatures) onSignatures(functions);
    const edges = functions.map(() => []);
    for (const [i, fn] of functions.entries()) {
        const emitter = new FunctionEmitter(lex, declared, records, edges[i], functionBase, enums, distinct, aliases);
        if (inspect) finishFunction(emitter, fn, inspect);
        else emitter.function(fn);
        if (onFunction) onFunction(fn);
    }

    const order = checkAcyclic(functions, edges);
    return { functions, records, enums, distinct, edges, order };
}
