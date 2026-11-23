// One frame's step function: the body cut at its waits into pieces dispatched by pc, with saves before each
// suspension and reloads on resumption.
function cut(fn) {
    const pieces = [];
    function piece(at, transfer) {
        const current = {at, transfer, statements: [], id: pieces.length};
        pieces.push(current);
        return current;
    }

    function sequence(nodes, next, breakTo) {
        let current = next;
        let native = [];
        function flush() {
            if (!native.length) return;
            const next = current;
            current = piece(native.at(-1).at, {kind: "jump", next});
            current.statements = native.reverse();
            native = [];
        }
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (!node.hasWait && (breakTo === undefined || !node.exits)) {
                native.push(node);
                continue;
            }
            flush();
            switch (node.kind) {
            case "break":
                current = piece(node.at, {kind: "jump", next: breakTo});
                break;
            case "await":
                node.resume = current;
                current = piece(node.at, {kind: "await", node});
                break;
            case "if": {
                const yes = sequence(node.yes, current, breakTo);
                const no = sequence(node.no, current, breakTo);
                current = piece(node.at, {kind: "branch", cond: node.cond, yes, no});
                break;
            }
            case "match": {
                const arms = node.arms.map(arm => ({...arm, next: sequence(arm.body, current, breakTo)}));
                current = piece(node.at, {kind: "match", value: node.value, arms});
                break;
            }
            case "while":
            case "for": {
                const loop = piece(node.at, null);
                const step = node.step ? sequence([node.step], loop, breakTo) : loop;
                const yes = sequence(node.body, step, current);
                loop.transfer = {kind: "branch", cond: node.cond, yes, no: current};
                current = node.init ? sequence([node.init], loop, breakTo) : loop;
                break;
            }
            default:
                throw new Error("invalid continuation cut " + node.kind);
            }
        }
        flush();
        return current;
    }

    const entry = sequence(fn.body, null);
    return {entry, pieces: pieces.reverse()};
}

function emitStep(program, writer, frame) {
    const fn = frame.fn;
    const step = frame.base + "step";
    const pc = program.prefix + "pc";
    const word = program.prefix + "word";
    const graph = cut(fn);
    const savedParams = new Set(fn.saved.filter(binding => binding.parameter));
    for (const binding of fn.bindings)
        binding.alias = (!binding.parameter || savedParams.has(binding))
            ? program.prefix + "local_" + binding.index + "_" + binding.name : binding.name;
    const line = (text, at = fn.start) => writer.line(text, at);
    const goto = piece => pc + " = " + (piece?.id ?? -1) + ";";
    const renderData = data => render(program, data);
    const savedField = binding => "state." + frame.slots.get(binding);
    function simple(node) {
        return (node.def ? node.def.alias + " = " : "") + renderData(node.data);
    }
    function native(node) {
        const at = node.at;
        switch (node.kind) {
        case "simple":
            line(simple(node) + ";", at);
            break;
        case "return": {
            const value = renderData(node.data);
            if (fn.result === "bool") {
                line("if (" + value + ") return 1;", at);
                line("return 0;", at);
            } else {
                line("return " + encode(value, fn.result) + ";", at);
            }
            break;
        }
        case "break":
            line("break;", at);
            break;
        case "if":
            line("if (" + renderData(node.cond) + ") {", at);
            for (const child of node.yes) native(child);
            if (node.no.length) {
                line("} else {", at);
                for (const child of node.no) native(child);
            }
            line("}", at);
            break;
        case "match":
            line("match (" + renderData(node.value) + ") {", at);
            for (const {names, body} of node.arms) {
                line(names.join(", ") + ": {", at);
                for (const child of body) native(child);
                line("}", at);
            }
            line("}", at);
            break;
        case "while":
        case "for": {
            const cond = renderData(node.cond);
            const head = node.init ? "for (" + simple(node.init) + "; " + cond + "; " + simple(node.step) + ") {"
                : "while (" + cond + ") {";
            line(head, at);
            for (const child of node.body) native(child);
            line("}", at);
            break;
        }
        default:
            throw new Error("non-native continuation statement " + node.kind);
        }
    }

    function transfer(ending, at) {
        if (ending.kind === "jump") {
            line(goto(ending.next), at);
        } else if (ending.kind === "branch") {
            line("if (" + renderData(ending.cond) + ") { " + goto(ending.yes) + " } else { " + goto(ending.no) + " }", at);
        } else if (ending.kind === "match") {
            line("match (" + renderData(ending.value) + ") {", at);
            for (const {names, next} of ending.arms) line(names.join(", ") + ": { " + goto(next) + " }", at);
            line("}", at);
        } else {
            const wait = ending.node;
            const child = frame.task.frames.get(wait.callee);
            const callee = child ? child.base + "step" : wait.name;
            line("const " + word + " = " + callee + "(" + renderData(wait.args) + ");", wait.at);
            const suspended = child ? "!(" + stateField(child, "state") + " === 0)" : word + " > 0";
            line("if (" + suspended + ") {", wait.at);
            if (child?.parents.length > 1) {
                const {id} = child.parents.find(parent => parent.frame === frame && parent.wait === wait);
                line(stateField(child, "caller") + " = " + id + ";", wait.at);
            }
            for (const binding of wait.saved) {
                const value = binding.type === "bool" ? binding.alias : encode(binding.alias, binding.type);
                line(savedField(binding) + " = " + value + ";", wait.at);
            }
            line(stateField(frame, "token") + " = " + (child ? "0" : word) + ";", wait.at);
            line(stateField(frame, "state") + " = " + wait.id + ";", wait.at);
            line("return 0;", wait.at);
            line("}", wait.at);
            if (wait.target) {
                const value = child ? decode(program, word, wait.type) : "false";
                line(wait.target.alias + " = " + value + ";", wait.at);
            }
            line(goto(wait.resume), wait.at);
        }
    }

    line(signature(step, fn.params, "i32"));
    for (const binding of fn.bindings) {
        if (!binding.parameter) line("let " + binding.alias + ": " + binding.type + ";", binding.at);
        else if (savedParams.has(binding))
            line("let " + binding.alias + " = " + binding.name + ";", binding.at);
    }
    if (!fn.waits.length) {
        for (const node of fn.body) native(node);
        line("}");
        return;
    }
    line("let " + pc + " = " + graph.entry.id + ";");
    for (const wait of fn.waits) {
        line("if (" + stateField(frame, "state") + " === " + wait.id + ") {", wait.at);
        for (const binding of wait.saved) {
            const field = savedField(binding);
            const value = binding.type === "bool" ? field : decode(program, field, binding.type);
            line(binding.alias + " = " + value + ";", wait.at);
        }
        if (wait.target)
            line(wait.target.alias + " = " + decode(program, stateField(frame, "token"), wait.type) + ";", wait.at);
        line(goto(wait.resume), wait.at);
        line("}", wait.at);
    }
    line(stateField(frame, "state") + " = 0;");
    line("while (" + pc + " >= 0) {");
    for (const piece of graph.pieces) {
        line("if (" + pc + " === " + piece.id + ") {", piece.at);
        for (const node of piece.statements) native(node);
        transfer(piece.transfer, piece.at);
        line("}", piece.at);
    }
    line("}");
    line("return 0;");
    line("}");
}
