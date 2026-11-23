// The entry: prepare (scan, check, analyze, allocate) and rewrite (the lowered program and its plan for the
// front end, compileFunctions in frontend/compile.js); what the bundle publishes.
function prepare(source, imports) {
    if (!candidate.test(source)) return null;
    const program = readProgram(source, imports);
    if (!program) return null;
    scanOperations(program);
    assertAcyclic(program);
    analyze(program);
    const allocation = allocate(program);
    if (allocation.fields.length && program.stateEnd === undefined)
        fail(source, 0, "async task requires the WorldState record");
    return {program, allocation};
}

function rewrite(source, imports = []) {
    const input = prepare(source, imports);
    if (!input) return null;
    const {program, allocation} = input;
    const writer = new GeneratedText(source);
    const startFields = new Map();
    const fields = allocation.fields;
    if (fields.length && allocation.layout.totalFields > 80)
        throw new SyntaxError("WorldState supports up to 80 scalar fields");
    let at = 0;
    if (fields.length) {
        writer.copy(at, program.stateEnd);
        writer.add("\n", program.stateEnd);
        for (const {name, type} of fields) writer.line("    " + name + ": " + type + ";", program.stateEnd);
        at = program.stateEnd;
    }
    const ordinarySignatures = [], bodies = [];
    for (const fn of program.functions.values()) {
        if (fn.async) {
            writer.copy(at, fn.start);
            at = fn.end;
            continue;
        }
        const {name, params, paramNames, result} = program.signatures[fn.index];
        const outputAt = writer.offset + fn.bodyAt - at;
        ordinarySignatures.push({name, params, paramNames, result, bodyAt: outputAt});
        for (const op of fn.replacements) {
            writer.copy(at, op.at);
            const root = allocation.tasks.get(op.target)?.root;
            let text;
            switch (op.kind) {
            case "start":
                text = root.base + "start";
                if (op.guard) startFields.set(text, root.base + "state");
                break;
            case "cancel": text = call(root.base + "cancel", ["state"]); break;
            case "pending": text = call(program.prefix + "pending", fields.length ? ["state"] : []); break;
            case "resume": text = call(program.prefix + "resume", [...ambient.keys()]); break;
            }
            writer.add(text, op.at);
            at = op.end;
        }
        bodies.push(fn.replacements.length ? {from: outputAt, to: writer.offset + fn.end - at}
            : {originalAt: fn.bodyAt});
    }
    writer.copy(at, source.length);
    const generatedAt = writer.offset;
    writer.add("\n", source.length);
    for (const frame of allocation.frames) emitStep(program, writer, frame);
    emitTaskOperations(program, writer, allocation);
    const lowered = writer.result(program.prefix, allocation.layout);
    Object.assign(lowered, {startFields, ordinarySignatures, generatedAt});
    lowered.plan = {
        original: source, declarations: program.types, fields,
        bodies: bodies.map(body => body.originalAt === undefined
            ? {text: writer.range(body.from, body.to), at: 0, from: body.from} : {at: body.originalAt}),
        generated: writer.range(generatedAt, writer.offset),
    };
    return lowered;
}

globalThis.typedAsync = {
    analyze(source, imports = []) { return prepare(source, imports)?.allocation.layout ?? null; },
    rewrite,
};
