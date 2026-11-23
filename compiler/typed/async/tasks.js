// The task operations' functions: start (with its busy check), cancel, pending, and resume, the dispatcher that
// routes a completion event to the innermost waiting frame and up through its callers.
function zero(type, types) {
    if (type === "bool") return "false";
    if (types.enums.has(type)) return type + "." + types.enums.get(type).keys().next().value;
    return "0";
}

function requestFrames(tasks) {
    const seen = new Set(), frames = [];
    function visit(frame) {
        if (seen.has(frame)) return;
        seen.add(frame);
        for (const wait of frame.fn.waits)
            if (wait.callee) visit(frame.task.frames.get(wait.callee));
        if (frame.fn.waits.some(wait => !wait.callee)) frames.push(frame);
    }
    for (const task of tasks.values()) visit(task.root);
    return frames;
}

function emitDispatcher(program, writer, allocation, op) {
    const {prefix, types} = program;
    const route = prefix + "route";
    const word = prefix + "value";
    const at = op.at;
    const line = text => writer.line(text, at);
    const params = [...ambient].map(([name, type]) => ({name, type}));
    const args = frame => frame.fn.params.map(param => param.ambient ? param.name : zero(param.type, types));
    const matches = frame => stateField(frame, "state") + " > 0 && " + stateField(frame, "token") +
        " > 0 && " + stateField(frame, "token") + " === event.token";
    const innermost = requestFrames(allocation.tasks);
    line(signature(prefix + "resume", params, "bool"));
    line("if (!(event.kind === " + completion + ")) return false;");
    if (allocation.frames.every(frame => !frame.parents.length)) {
        for (const frame of innermost) {
            line("if (" + matches(frame) + ") {");
            line(stateField(frame, "token") + " = 0;");
            line("if (event.ok) { " + stateField(frame, "token") + " = 1; }");
            line(call(frame.base + "step", args(frame)) + ";");
            line("return true;");
            line("}");
        }
        line("return false;");
        line("}");
        return;
    }
    line("let " + route + " = 0;");
    for (const frame of innermost)
        line("if (" + route + " === 0 && " + matches(frame) + ") { " + route + " = " + frame.id + "; }");
    line("if (" + route + " === 0) return false;");
    line("let " + word + " = 0;");
    line("if (event.ok) { " + word + " = 1; }");
    line("while (" + route + " > 0) {");
    for (const frame of allocation.frames) {
        line("if (" + route + " === " + frame.id + ") {");
        line(stateField(frame, "token") + " = " + word + ";");
        line(word + " = " + call(frame.base + "step", args(frame)) + ";");
        line(route + " = 0;");
        if (frame.parents.length) {
            line("if (" + stateField(frame, "state") + " === 0) {");
            for (const parent of frame.parents) {
                const next = route + " = " + parent.frame.id + ";";
                line(frame.parents.length === 1 ? next :
                    "if (" + stateField(frame, "caller") + " === " + parent.id + ") { " + next + " }");
            }
            line("}");
        }
        line("}");
    }
    line("}");
    line("return true;");
    line("}");
}

function emitTaskOperations(program, writer, allocation) {
    const {prefix} = program;
    const operations = [...program.functions.values()].flatMap(fn => fn.replacements);
    for (const [fn, task] of allocation.tasks) {
        const root = task.root;
        const start = text => writer.line(text, fn.start);
        start(signature(root.base + "start", fn.params, "bool"));
        start("if (" + stateField(root, "state") + " > 0) return false;");
        start(call(root.base + "step", fn.params.map(param => param.name)) + ";");
        start("return true;");
        start("}");
        const cancel = operations.find(op => op.kind === "cancel" && op.target === fn);
        if (!cancel) continue;
        const line = text => writer.line(text, cancel.at);
        line(signature(root.base + "cancel", [{name: "state", type: "WorldState"}], "i32"));
        for (const frame of task.frames.values()) {
            line(stateField(frame, "state") + " = 0;");
            line(stateField(frame, "token") + " = 0;");
            if (frame.parents.length > 1) line(stateField(frame, "caller") + " = 0;");
        }
        line("return 0;");
        line("}");
    }
    const pending = operations.find(op => op.kind === "pending");
    if (pending) {
        const line = text => writer.line(text, pending.at);
        const states = [...allocation.tasks.values()].map(task => stateField(task.root, "state") + " > 0");
        const params = states.length ? [{name: "state", type: "WorldState"}] : [];
        line(signature(prefix + "pending", params, "bool"));
        line("return " + (states.join(" || ") || "false") + ";");
        line("}");
    }
    const resume = operations.find(op => op.kind === "resume");
    if (resume) emitDispatcher(program, writer, allocation, resume);
}
