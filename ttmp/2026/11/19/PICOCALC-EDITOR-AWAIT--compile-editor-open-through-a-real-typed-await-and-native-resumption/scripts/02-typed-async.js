// Lower one top-level file-read await in a typed world before target selection.
(() => {
"use strict";
const ambient = [["event","WorldEvent"], ["state","WorldState"], ["output","buffer"], ["hints","buffer"]];
const scalar = new Set(["i32", "bool"]);
const marker = /^[\t ]*async[\t ]+function\b/m;

class Reader {
    constructor(source, position) {
        this.source = source;
        this.position = position;
        this.previousEnd = position;
        this.depth = 0;
        this.pattern = /\s*(?:\/\/[^\n]*(?:\n|$)\s*)*(?:(?<id>[a-zA-Z_]\w*)|(?<string>"(?:[^"\\\r\n]|\\.)*")|(?<other>\S))/y;
        this.next();
    }

    next() {
        this.previousEnd = this.position;
        this.pattern.lastIndex = this.position;
        const match = this.pattern.exec(this.source);
        if (!match) {
            this.token = {value: "", offset: this.position, id: false};
            return;
        }
        const value = match.groups.id ?? match.groups.string ?? match.groups.other;
        this.position = this.pattern.lastIndex;
        this.token = {value, offset: this.position-value.length, id: !!match.groups.id};
    }

    fail(message, offset = this.token.offset) {
        const lines = this.source.slice(0, offset).split("\n");
        throw new SyntaxError(lines.length + ":" + (lines.at(-1).length + 1) + ": " + message);
    }

    take(value) {
        if (this.token.value !== value) return false;
        this.next();
        return true;
    }

    expect(value) {
        if (!this.take(value)) this.fail("expected " + value);
    }

    name() {
        const token = this.token;
        if (!token.id || token.value.startsWith("__await")) this.fail("expected typed await identifier");
        this.next();
        return token.value;
    }

    parens() {
        this.expect("(");
        const tokens = [];
        let depth = 1;
        while (this.token.value) {
            if (this.token.value === "(") depth++;
            if (this.token.value === ")" && --depth === 0) {
                this.next();
                return tokens;
            }
            tokens.push(this.token);
            this.next();
        }
        this.fail("unclosed condition");
    }

    statements() {
        if (++this.depth > 128) this.fail("async statement nesting limit exceeded");
        const statements = [];
        while (this.token.value !== "}") {
            if (!this.token.value) this.fail("unclosed async body");
            statements.push(this.statement());
        }
        this.depth--;
        return statements;
    }

    statement() {
        const from = this.token.offset;
        if (this.token.value === "if" || this.token.value === "while") {
            const kind = this.token.value;
            this.next();
            const test = this.parens();
            let body;
            if (this.take("{")) {
                body = this.statements();
                this.expect("}");
            } else {
                if (kind !== "if" || this.token.value !== "return") this.fail("expected control body");
                body = [this.statement()];
            }
            return {kind, test, body, from, to: this.previousEnd};
        }
        const tokens = [];
        while (this.token.value !== ";") {
            if (!this.token.value || this.token.value === "}") this.fail("expected ;");
            tokens.push(this.token);
            this.next();
        }
        this.expect(";");
        const awaitIndex = tokens.findIndex(token => token.value === "await");
        if (awaitIndex !== -1) {
            const [kind, target, eq, wait, callee, lp, handle, rp] = tokens.map(t => t.value);
            if (tokens.length !== 8 || kind !== "const" || !tokens[1].id || eq !== "=" ||
                wait !== "await" || callee !== "typedSdkFileRead" || lp !== "(" || !tokens[6].id || rp !== ")")
                this.fail("expected const result = await typedSdkFileRead(handle);", from);
            return {kind: "await", target, handle, from, to: this.previousEnd};
        }
        return {kind: tokens[0]?.value === "return" ? "return" : "simple", tokens, from, to: this.previousEnd};
    }

    task() {
        const start = this.token.offset;
        this.expect("async");
        this.expect("function");
        const name = this.name();
        this.expect("(");
        const parameters = [];
        if (!this.take(")")) {
            do {
                const name = this.name();
                this.expect(":");
                parameters.push({name, type: this.name(), mutable: false, parameter: true});
            } while (this.take(","));
            this.expect(")");
        }
        this.expect(":");
        this.expect("i32");
        this.expect("{");
        const bodyStart = this.previousEnd;
        const statements = this.statements();
        const bodyEnd = this.token.offset;
        this.expect("}");
        return {name, parameters, statements, start, end: this.previousEnd, bodyStart, bodyEnd};
    }
}

function declaration(statement) {
    if (statement.kind !== "simple") return null;
    const [kind, name, colon, type] = statement.tokens.map(token => token.value);
    if (kind !== "let" && kind !== "const") return null;
    return {name, type: colon === ":" ? type : null, mutable: kind === "let"};
}

function uses(tokens, live) {
    for (const [i, token] of tokens.entries()) {
        if (token.id && tokens[i-1]?.value !== "." && tokens[i+1]?.value !== "(")
            live.add(token.value);
    }
}

function liveBefore(statements, out) {
    let live = new Set(out);
    for (let i = statements.length - 1; i >= 0; i--) {
        const node = statements[i];
        if (node.kind === "if") {
            for (const name of liveBefore(node.body, live)) live.add(name);
            uses(node.test, live);
        } else if (node.kind === "while") {
            uses(node.test, live);
            let previous;
            do {
                previous = live.size;
                for (const name of liveBefore(node.body, live)) live.add(name);
            } while (live.size !== previous);
        } else {
            if (node.kind === "return") live.clear();
            const declared = declaration(node);
            const assigned = node.tokens[0]?.id && node.tokens[1]?.value === "=";
            if (declared || assigned) {
                live.delete(declared?.name ?? node.tokens[0].value);
                uses(node.tokens.slice(node.tokens.findIndex(t=>t.value === "=")+1), live);
            } else uses(node.tokens, live);
        }
    }
    return live;
}

function awaits(statements) {
    let all = [];
    for (const statement of statements) {
        if (statement.kind === "await") all.push(statement);
        if (statement.body) all = all.concat(awaits(statement.body));
    }
    return all;
}

function assignedLocals(statements, names) {
    for (const node of statements) {
        if (node.body) assignedLocals(node.body, names);
        else if (node.tokens?.[0]?.id && node.tokens[1]?.value === "=") names.add(node.tokens[0].value);
    }
    return names;
}

function addFrame(source, fields, reader) {
    const pattern = /^[\t ]*record\s+WorldState\s*\{/gm;
    const match = pattern.exec(source);
    if (!match) reader.fail("async task requires record WorldState", 0);
    const end = source.indexOf("}", pattern.lastIndex);
    if (end < 0) reader.fail("unterminated record WorldState", match.index);
    return source.slice(0, end) + fields.map(({name,type}) => "    " + name + ": " + type + ";\n").join("") + source.slice(end);
}

function lower(source) {
    const found = marker.exec(source);
    if (!found) return {source, layout: null};
    const reader = new Reader(source, found.index);
    const task = reader.task();
    const later = marker.exec(source.slice(task.end));
    if (later) reader.fail("one async task is supported", task.end+later.index);
    for (const [i, [name,type]] of ambient.entries()) {
        if (task.parameters[i]?.name !== name || task.parameters[i].type !== type)
            reader.fail("async requires ambient event, state, output and hints parameters", task.start);
    }
    if (task.parameters.slice(ambient.length).some(param => !scalar.has(param.type)))
        reader.fail("only scalar non-ambient async parameters are allowed", task.start);
    const waits = awaits(task.statements);
    const wait = waits[0];
    const index = task.statements.indexOf(wait);
    if (waits.length !== 1 || index < 0) reader.fail("expected one top-level file-read await", task.start);
    const before = task.statements.slice(0, index), after = task.statements.slice(index+1);
    const bindings = [...task.parameters, ...before.map(declaration).filter(Boolean)];
    const handle = bindings.find(binding => binding.name === wait.handle);
    if (!handle || handle.type !== "i32")
        reader.fail("the awaited file handle must have an explicit i32 type", wait.from);
    if (bindings.some(binding=>binding.name===wait.target))
        reader.fail("duplicate await result "+wait.target, wait.from);
    const live = liveBefore(after, new Set());
    live.delete(wait.target);
    const ambientNames = ambient.map(pair=>pair[0]);
    const saved = bindings.filter(binding => !ambientNames.includes(binding.name) && live.has(binding.name));
    for (const binding of saved) {
        if (!scalar.has(binding.type)) {
            const reason = binding.type ? "reference " + binding.name : "untyped local " + binding.name;
            reader.fail(reason + " is live across await, obtain it again after the wait", wait.from);
        }
    }
    // Cancellation returns the owned handle to the application even when the
    // successful continuation does not read it.
    const stored = bindings.filter(binding => saved.includes(binding) || binding === handle);
    const namespace = "__await_" + task.name + "_";
    const token = namespace + "token";
    const field = binding => namespace + binding.name;
    const declared = params => params.map(({name,type})=>name+": "+type).join(", ");
    const arg = binding => "__await_value_" + binding.name;
    const formals = ambient.map(([name,type])=>({name,type}));
    const liveArgs = ambientNames.join(", ");
    const prefix = source.slice(task.bodyStart, wait.from);
    const suffix = source.slice(wait.to, task.bodyEnd);
    const clear = stored.map(binding=> "state."+field(binding)+" = " + (binding.type==="bool"?"false":"0") + ";").join("\n    ");
    const reload = saved.map(binding=> "const "+arg(binding)+" = state."+field(binding)+";").join("\n    ");
    const assignments = assignedLocals(after, new Set());
    const initialize = bindings.filter(binding => binding.mutable && !live.has(binding.name) &&
        assignments.has(binding.name));
    for (const binding of initialize) {
        if (!scalar.has(binding.type))
            reader.fail("rebind "+binding.name+" with a new declaration after await", wait.from);
    }
    const locals = [
        ...saved.map(binding => (binding.mutable ? "let " : "const ") +
            binding.name + ": " + binding.type + " = " + arg(binding) + ";"),
        ...initialize.map(binding => "let " + binding.name + ": " + binding.type + " = " +
            (binding.type === "bool" ? "false;" : "0;"))
    ].join("\n    ");
    const afterArgs = saved.map(binding=>", "+arg(binding)).join("");
    const loaded = saved.map(binding=>", "+binding.name).join("");
    const saves = stored.map(binding=> "state."+field(binding)+" = "+binding.name+";").join("\n    ");
    const afterSignature = [
        ...formals, ...saved.map(binding=>({...binding, name:arg(binding)})), {name:wait.target,type:"bool"}];
    const name = task.name;
    const generated = `
function ${name}After(${declared(afterSignature)}): i32 {
    ${locals}
    ${suffix}
}
function ${name}Start(${declared(task.parameters)}): i32 {
    if (state.${token} > 0) return 1;
    ${prefix}
    const __await_token = typedSdkFileRead(${wait.handle});
    if (__await_token <= 0) return ${name}After(${liveArgs}${loaded}, false);
    ${saves}
    state.${token} = __await_token;
    return 1;
}
function ${name}Pending(state: WorldState): bool {
    return state.${token} > 0;
}
function ${name}Resume(${declared(formals)}): i32 {
    if (!(event.kind === 4 && state.${token} > 0 && event.token === state.${token})) return 0;
    ${reload}
    state.${token} = 0;
    ${clear}
    return ${name}After(${liveArgs}${afterArgs}, event.ok);
}
function ${name}Cancel(state: WorldState): i32 {
    if (state.${token} <= 0) return 0;
    const __await_owned = state.${field(handle)};
    state.${token} = 0;
    ${clear}
    return __await_owned;
}
`;
    const fields = [{name:token,type:"i32"}, ...stored.map(binding=>({name:field(binding),type:binding.type}))];
    const layout = {task:name, wait:"typedSdkFileRead", saved:saved.map(({name,type})=>({name,type})),
        owned:handle.name, frameBytes:4*fields.length, fields};
    return {source:addFrame(source.slice(0, task.start) + generated + source.slice(task.end), fields, reader), layout};
}

globalThis.typedAsync = {lower};
})();
