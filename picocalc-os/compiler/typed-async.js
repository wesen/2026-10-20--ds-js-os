// Rewrite typed async functions before emission. The reactor owns each frame
// in WorldState, so only its scalar fields survive an event boundary.
(() => {
"use strict";

// Existing typed sources use start and pending as locals and record fields.
const candidate = /\b(?:async|await|start|cancel)\b\s*(?:\/\/[^\n]*\n\s*)*[a-zA-Z_]\w*|\b(?:resume|pending)\b\s*(?:\/\/[^\n]*\n\s*)*\(/;
const ambient = new Map([["event", "WorldEvent"], ["state", "WorldState"],
    ["output", "buffer"], ["hints", "buffer"]]);
const completion = 4;

function isOperation(tokens, i) {
    const {value} = tokens[i];
    const next = tokens[i + 1];
    if (value === "async" || value === "await") return true;
    if (value === "start" || value === "cancel") return next?.kind === "id";
    if (value === "resume" || value === "pending") return next?.value === "(";
    return false;
}

function location(source, at) {
    const prefix = source.slice(0, at);
    return prefix.split("\n").length + ":" + (at - prefix.lastIndexOf("\n"));
}

function fail(source, at, message) {
    throw new SyntaxError(location(source, at) + ": " + message);
}

function tokensFrom(source, at) {
    const tokens = [];
    const lex = new typedWasm.Lexer(source, at);
    for (; lex.token.kind !== "eof"; lex.next()) {
        tokens.push({...lex.token, end: lex.offset});
    }
    tokens.push({...lex.token, end: lex.offset});
    return tokens;
}

class Cursor {
    constructor(source, tokens, i = 0) {
        this.source = source;
        this.tokens = tokens;
        this.i = i;
    }

    get token() { return this.tokens[this.i]; }
    get value() { return this.token.value; }

    fail(message, at = this.token.at) { fail(this.source, at, message); }

    take() {
        const token = this.token;
        if (token.kind === "eof") this.fail("unexpected end of source");
        this.i++;
        return token;
    }

    accept(value) {
        if (this.value !== value) return false;
        this.take();
        return true;
    }

    expect(value) {
        if (!this.accept(value)) this.fail("expected " + value);
    }

    ident() {
        const token = this.token;
        new typedWasm.Lexer(this.source, token.at, token.end).ident();
        this.take();
        return token.value;
    }

    range(end) {
        const from = this.i;
        let depth = 0;
        while (depth || this.value !== end) {
            if (this.value === ")" && !depth || this.value === "{" || this.value === "}")
                this.fail("expected " + end);
            if (this.value === "(") depth++;
            if (this.value === ")") depth--;
            this.take();
        }
        return this.tokens.slice(from, this.i);
    }

    blockRange() {
        this.expect("{");
        const from = this.i;
        let depth = 1;
        while (depth) {
            const value = this.take().value;
            if (value === "{") depth++;
            if (value === "}") depth--;
        }
        return [from, this.i - 1];
    }
}

function readProgram(source, imported) {
    const lex = new typedWasm.Lexer(source);
    const types = typedWasm.parseDeclarations(lex);
    const tokens = tokensFrom(source, 0);
    if (!tokens.some((_, i) => isOperation(tokens, i))) return null;
    const c = new Cursor(source, tokens, tokens.findIndex(token => token.at === lex.token.at));
    const functions = new Map();
    const imports = new Map(imported.map(fn => [fn.name, fn]));
    const usedNames = new Set(tokens.filter(token => token.kind === "id").map(token => token.value));
    let prefix = "__typed_async_";
    while ([...usedNames].some(name => name.startsWith(prefix))) prefix += "_";
    let stateEnd;
    for (let i = 0; i < c.i; i++) {
        if (tokens[i].value !== "record" || tokens[i + 1]?.value !== "WorldState") continue;
        stateEnd = tokens.slice(i + 2, c.i).find(token => token.value === "}")?.at;
        break;
    }
    while (c.token.kind !== "eof") {
        const start = c.token.at;
        const async = c.accept("async");
        c.expect("function");
        const name = c.ident();
        if (functions.has(name) || imports.has(name)) c.fail("duplicate function " + name, start);
        const params = [];
        const names = new Set();
        c.expect("(");
        if (!c.accept(")")) {
            do {
                const at = c.token.at;
                const name = c.ident();
                c.expect(":");
                const bindingType = new typedWasm.Lexer(source, c.token.at, c.token.end);
                const type = bindingType.type(types.records, types.enums, types.distinct);
                c.take();
                if (names.has(name)) c.fail("duplicate local " + name, at);
                names.add(name);
                params.push({name, type, at, ambient: ambient.get(name) === type});
            } while (c.accept(","));
            c.expect(")");
        }
        c.expect(":");
        const result = new typedWasm.Lexer(source, c.token.at, c.token.end)
            .type(types.records, types.enums, types.distinct);
        c.take();
        const [from, to] = c.blockRange();
        functions.set(name, {name, async, params, result, from, to, start,
            end: tokens[to].end, edges: new Set(), waits: [], bindings: [], replacements: []});
    }
    return {source, tokens, types, functions, imports, prefix, stateEnd,
        tasks: new Set(), stateFields: types.records.get("WorldState")?.size ?? 0};
}

function scalar(type, {enums, distinct}) {
    return type === "i32" || type === "bool" || enums.has(type) || distinct.has(type);
}

function sourceCallables(program) {
    const functions = new Map(program.imports);
    for (const fn of program.functions.values()) {
        if (fn.async) continue;
        functions.set(fn.name, {name: fn.name, params: fn.params.map(param => param.type), result: fn.result, index: 0});
    }
    return functions;
}

function scanOperations(program) {
    const {source, functions, tokens, tasks} = program;
    for (const fn of functions.values()) {
        for (let i = fn.from; i < fn.to; i++) {
            const {value, at} = tokens[i];
            const next = tokens[i + 1];
            if (value === "async") fail(source, at, "async can only introduce a function");
            if (value === "await" && !fn.async) fail(source, at, "await is only allowed in an async function");
            if ((value === "start" || value === "cancel") && isOperation(tokens, i)) {
                if (fn.async) fail(source, at, value + " is only allowed in an ordinary function");
                const target = functions.get(next?.value);
                if (!target?.async) fail(source, at, "expected an async function after " + value);
                if (value === "start") {
                    if (tokens[i + 2]?.value !== "(") fail(source, at, "expected arguments after start " + target.name);
                    fn.edges.add(target);
                    tasks.add(target);
                } else if (![";", "{", "}"].includes(tokens[i - 1]?.value) || tokens[i + 2]?.value !== ";") {
                    fail(source, at, "cancel must be a statement");
                }
                fn.replacements.push({kind: value, at, end: next.end, target});
                i++;
                continue;
            }
            if ((value === "resume" || value === "pending") && isOperation(tokens, i)) {
                if (fn.async) fail(source, at, value + " is only allowed in an ordinary function");
                if (value === "resume" && fn.name !== "typedWorldEvent")
                    fail(source, at, "resume is only allowed in typedWorldEvent");
                if (next?.value !== "(" || tokens[i + 2]?.value !== ")")
                    fail(source, at, "expected " + value + "()");
                fn.replacements.push({kind: value, at, end: tokens[i + 2].end});
                i += 2;
                continue;
            }
            if (next?.value === "(" && tokens[i - 1]?.value !== ".") {
                const target = functions.get(value);
                if (!target) continue;
                if (target.async && tokens[i - 1]?.value !== "await")
                    fail(source, at, "call async function " + value + " with start or await");
                fn.edges.add(target);
            }
        }
    }
    for (const fn of functions.values()) {
        for (const op of fn.replacements) {
            if (op.kind === "cancel" && !tasks.has(op.target))
                fail(source, op.at, "cancel requires a task named by start: " + op.target.name);
            if (op.kind === "resume") for (const task of tasks) fn.edges.add(task);
        }
    }
}

function assertAcyclic(program) {
    const finished = new Set();
    const visiting = new Set();
    const path = [];
    function visit(fn) {
        if (finished.has(fn)) return;
        if (visiting.has(fn)) {
            const cycle = [...path.slice(path.indexOf(fn)), fn].map(entry => entry.name);
            fail(program.source, fn.start, "recursive call cycle: " + cycle.join(" -> "));
        }
        visiting.add(fn);
        path.push(fn);
        for (const target of fn.edges) visit(target);
        path.pop();
        visiting.delete(fn);
        finished.add(fn);
    }
    for (const fn of program.functions.values()) visit(fn);
}

class AsyncBody extends Cursor {
    constructor(program, fn, ordinary) {
        super(program.source, program.tokens, fn.from);
        this.program = program;
        this.fn = fn;
        this.ordinary = ordinary;
        this.depth = 0;
        this.loopDepth = 0;
        this.locals = new Map();
        const {types} = program;
        if (!scalar(fn.result, types)) this.fail("async result must be scalar", fn.start);
        if (!fn.params.some(param => param.type === "WorldState"))
            this.fail("async function requires a WorldState parameter", fn.start);
        for (const param of fn.params) {
            if (!param.ambient && !scalar(param.type, types))
                this.fail("async reference parameter " + param.name + " is not an ambient handler parameter", param.at);
            param.parameter = true;
            this.add(param);
        }
    }

    add(binding) {
        if (this.locals.has(binding.name)) this.fail("duplicate local " + binding.name, binding.at);
        binding.index = this.fn.bindings.length;
        this.fn.bindings.push(binding);
        this.locals.set(binding.name, binding);
        return binding;
    }

    inScope(parse) {
        const enclosing = this.locals;
        this.locals = new Map(enclosing);
        const node = parse();
        this.locals = enclosing;
        return node;
    }

    emitter(tokens, functions = this.ordinary, semicolon = false) {
        const from = tokens[0].at;
        const to = tokens.at(-1).end;
        // The update in a for header is a statement without its final semicolon.
        const lex = semicolon
            ? new typedWasm.Lexer(this.source.slice(0, to) + ";", from, to + 1)
            : new typedWasm.Lexer(this.source, from, to);
        const {records, enums, distinct} = this.program.types;
        const emitter = new typedWasm.FunctionEmitter(lex, functions, records, undefined, 0, enums, distinct);
        for (const [name, binding] of this.locals) emitter.local(name, binding.type, binding.mutable);
        return emitter;
    }

    references(tokens) {
        const refs = new Map();
        for (let i = 0; i < tokens.length; i++) {
            const binding = this.locals.get(tokens[i].value);
            if (binding && tokens[i - 1]?.value !== "." && tokens[i + 1]?.value !== "(")
                refs.set(tokens[i].at, binding);
        }
        return {tokens, refs, uses: new Set(refs.values())};
    }

    expression(tokens, expected, functions) {
        if (!tokens.length) this.fail("expected expression");
        const forbidden = tokens.find(token => token.value === "await");
        if (forbidden) this.fail("await is only allowed as a complete statement or assignment", forbidden.at);
        const emitter = this.emitter(tokens, functions);
        const type = emitter.expr();
        if (expected !== undefined) emitter.want(type, expected);
        if (emitter.lex.token.kind !== "eof") emitter.lex.fail("expected end of expression");
        return {type, ...this.references(tokens)};
    }

    assignmentTarget(nameToken, type) {
        const target = this.locals.get(nameToken.value);
        if (!target) this.fail("unknown local " + nameToken.value, nameToken.at);
        if (!target.mutable) this.fail("expected mutable local " + target.name, nameToken.at);
        if (target.type !== type) this.fail("expected " + target.type + ", got " + type, nameToken.at);
        return target;
    }

    wait(tokens, index, declaration) {
        const at = tokens[index].at;
        const call = tokens.slice(index + 1);
        if ((index !== 0 && tokens[index - 1].value !== "=") ||
            (index !== 0 && !declaration && (index !== 2 || tokens[0].kind !== "id")) ||
            (declaration && index !== (tokens[2]?.value === ":" ? 5 : 3)) ||
            call[0]?.kind !== "id" || call[1]?.value !== "(")
            this.fail("await is only allowed as a complete statement or assignment", at);
        let depth = 0;
        const callEnd = call.findIndex((token, i) => {
            if (token.value === "(") depth++;
            if (token.value === ")") depth--;
            return i > 1 && depth === 0;
        });
        if (callEnd !== call.length - 1)
            this.fail("await requires one direct call as a complete statement", at);
        const name = call[0].value;
        const callee = this.program.functions.get(name);
        const sdk = this.program.imports.get(name);
        if (!callee?.async && !sdk?.awaitable)
            this.fail("expected an async function or awaitable reactor function, got " + name, at);
        const type = sdk ? "bool" : callee.result;
        let checked = this.ordinary;
        if (callee) {
            checked = new Map(checked);
            checked.set(name, {name, params: callee.params.map(param => param.type), result: type, index: 0});
        }
        this.expression(call, sdk ? "i32" : type, checked);
        const args = this.references(call.slice(2, -1));
        let target;
        if (declaration) {
            const binding = tokens[1];
            new typedWasm.Lexer(this.source, binding.at, binding.end).ident();
            if (tokens[2]?.value === ":" && tokens[3]?.value !== type)
                this.fail("expected " + tokens[3]?.value + ", got " + type, at);
            target = this.add({name: binding.value, type, mutable: tokens[0].value === "let", at: binding.at});
        } else if (index !== 0) {
            target = this.assignmentTarget(tokens[0], type);
        }
        const node = {kind: "await", at, id: this.fn.waits.length + 1, name, callee, target, args, type, hasWait: true};
        this.fn.waits.push(node);
        return node;
    }

    simple(tokens, semicolon) {
        const first = tokens[0];
        const at = first.at;
        const syntax = semicolon ? tokens.slice(0, -1) : tokens;
        const declaration = first.value === "let" || first.value === "const";
        const index = syntax.findIndex(token => token.value === "await");
        if (index >= 0) return this.wait(syntax, index, declaration);
        const emitter = this.emitter(tokens, undefined, !semicolon);
        const assignment = !declaration && syntax[1]?.value === "=";
        const equals = syntax.findIndex(token => token.value === "=");
        const data = this.references(declaration || assignment ? syntax.slice(equals + 1) : syntax);
        emitter.statement(this.fn.result);
        if (emitter.lex.token.kind !== "eof") emitter.lex.fail("unexpected token after statement");
        let def;
        if (declaration) {
            const name = syntax[1].value;
            const checked = emitter.locals.get(name);
            def = this.add({name, type: checked.type, mutable: checked.mutable, at: syntax[1].at});
        } else if (assignment) {
            def = this.locals.get(first.value);
        }
        return {kind: "simple", at, data, def};
    }

    body() {
        if (++this.depth > 128) this.fail("async statement nesting limit exceeded");
        const result = this.inScope(() => {
            this.expect("{");
            const nodes = [];
            while (!this.accept("}")) nodes.push(this.statement());
            return nodes;
        });
        this.depth--;
        return result;
    }

    condition() {
        this.expect("(");
        const cond = this.expression(this.range(")"), "bool");
        this.expect(")");
        return cond;
    }

    branchBody() {
        if (this.value === "{") return this.body();
        if (this.value !== "return") this.fail("expected a block or return");
        return [this.statement()];
    }

    loopBody() {
        this.loopDepth++;
        const body = this.body();
        this.loopDepth--;
        return body;
    }

    statement() {
        const at = this.token.at;
        if (this.accept("if")) {
            const cond = this.condition();
            const yes = this.branchBody();
            const no = this.accept("else") ? (this.value === "if" ? [this.statement()] : this.branchBody()) : [];
            return {kind: "if", at, cond, yes, no, hasWait: contains(yes, "hasWait") || contains(no, "hasWait"),
                exits: contains(yes, "exits") || contains(no, "exits")};
        }
        if (this.accept("while")) {
            const cond = this.condition();
            const body = this.loopBody();
            return {kind: "while", at, cond, body, hasWait: contains(body, "hasWait")};
        }
        if (this.accept("for")) return this.inScope(() => {
            this.expect("(");
            if (this.value !== "let" && this.tokens[this.i + 1]?.value !== "=")
                this.fail("expected a let declaration or assignment in the for initializer");
            const init = this.readSimple(";");
            if (init.hasWait) this.fail("await is only allowed in the for body", init.at);
            const cond = this.expression(this.range(";"), "bool");
            this.expect(";");
            if (this.tokens[this.i + 1]?.value !== "=")
                this.fail("expected an assignment in the for update");
            const step = this.readSimple(")");
            if (step.hasWait) this.fail("await is only allowed in the for body", step.at);
            this.expect(")");
            const body = this.loopBody();
            return {kind: "for", at, init, cond, step, body, hasWait: contains(body, "hasWait")};
        });
        if (this.accept("return")) {
            const data = this.expression(this.range(";"), this.fn.result);
            this.expect(";");
            return {kind: "return", at, data};
        }
        if (this.accept("break")) {
            if (!this.loopDepth) this.fail("break is only allowed in a loop", at);
            this.expect(";");
            return {kind: "break", at, exits: true};
        }
        return this.readSimple(";");
    }

    readSimple(end) {
        const tokens = this.range(end);
        if (!tokens.length) this.fail("expected a statement");
        if (end === ";") tokens.push(this.take());
        return this.simple(tokens, end === ";");
    }

    parse() {
        const statements = [];
        while (this.i < this.fn.to) statements.push(this.statement());
        if (statements.at(-1)?.kind !== "return")
            this.fail("expected a final return", this.program.tokens[this.fn.to].at);
        return statements;
    }
}

function contains(sequence, property) {
    return sequence.some(node => node[property]);
}

function merge(...sets) {
    const combined = new Set();
    for (const set of sets) for (const binding of set) combined.add(binding);
    return combined;
}

function without(set, binding) {
    const result = new Set(set);
    result.delete(binding);
    return result;
}

function liveSequence(nodes, out, loopExit) {
    for (let i = nodes.length - 1; i >= 0; i--) out = liveBefore(nodes[i], out, loopExit);
    return out;
}

function liveBefore(node, out, loopExit) {
    switch (node.kind) {
    case "simple":
        return merge(without(out, node.def), node.data.uses);
    case "return":
        return node.data.uses;
    case "break":
        return loopExit;
    case "await":
        node.after = without(out, node.target);
        return merge(node.after, node.args.uses);
    case "if":
        return merge(node.cond.uses, liveSequence(node.yes, out, loopExit), liveSequence(node.no, out, loopExit));
    case "while":
    case "for": {
        const base = merge(node.cond.uses, out);
        let live = base;
        while (true) {
            const bodyEnd = node.step ? liveBefore(node.step, live, out) : live;
            const next = merge(base, liveSequence(node.body, bodyEnd, out));
            if (next.size === live.size) break;
            live = next;
        }
        return node.init ? liveBefore(node.init, live, loopExit) : live;
    }
    default:
        throw new Error("unknown continuation statement " + node.kind);
    }
}

function analyze(program) {
    const ordinary = sourceCallables(program);
    for (const fn of program.functions.values()) {
        if (!fn.async) continue;
        fn.body = new AsyncBody(program, fn, ordinary).parse();
        liveSequence(fn.body, new Set(), new Set());
        const saved = new Set();
        for (const wait of fn.waits) {
            wait.saved = fn.bindings.filter(binding => wait.after.has(binding) && !binding.ambient);
            for (const binding of wait.saved) {
                if (!scalar(binding.type, program.types)) {
                    const line = location(program.source, wait.at).split(":")[0];
                    fail(program.source, wait.at, binding.name + " is live across the wait at line " + line +
                        "; obtain it again after the wait");
                }
                saved.add(binding);
            }
        }
        fn.saved = fn.bindings.filter(binding => saved.has(binding));
    }
}

function allocate(program) {
    const tasks = new Map();
    const frames = [];
    for (const fn of program.functions.values()) {
        if (!program.tasks.has(fn)) continue;
        const reachable = new Set([fn]);
        for (const current of reachable)
            for (const wait of current.waits) if (wait.callee) reachable.add(wait.callee);
        const task = {fn, frames: new Map()};
        for (const current of program.functions.values()) {
            if (!reachable.has(current)) continue;
            const id = frames.length + 1;
            const base = program.prefix + id + "_" + fn.name + "_" + current.name + "_";
            const frame = {fn: current, id, base, task, parents: [], fields: [], slots: new Map()};
            task.frames.set(current, frame);
            frames.push(frame);
        }
        for (const frame of task.frames.values()) {
            for (const wait of frame.fn.waits) {
                if (!wait.callee) continue;
                const child = task.frames.get(wait.callee);
                child.parents.push({frame, wait, id: child.parents.length + 1});
            }
        }
        task.root = task.frames.get(fn);
        tasks.set(fn, task);
    }
    for (const frame of frames) {
        frame.fields.push({name: frame.base + "state", type: "i32"}, {name: frame.base + "token", type: "i32"});
        for (const binding of frame.fn.saved) {
            const name = frame.base + "v" + binding.index + "_" + binding.name;
            frame.slots.set(binding, name);
            // A frame can refer to a scalar type declared after WorldState.
            // Its external layout uses only the two ABI storage types.
            frame.fields.push({name, type: binding.type === "bool" ? "bool" : "i32"});
        }
        if (frame.parents.length > 1) frame.fields.push({name: frame.base + "caller", type: "i32"});
    }
    const fields = frames.flatMap(frame => frame.fields);
    const layout = {declaredFields: program.stateFields, totalFields: program.stateFields + fields.length,
        tasks: Object.fromEntries([...tasks.values()].map(task => [task.fn.name, [...task.frames.values()].map(frame => ({
            function: frame.fn.name,
            fields: frame.fields.map(field => field.name),
            waits: frame.fn.waits.map(wait => ({
                id: wait.id, line: Number(location(program.source, wait.at).split(":")[0]),
                callee: wait.name, saved: wait.saved.map(binding => binding.name),
            })),
        }))]))};
    return {tasks, frames, fields, layout};
}

class GeneratedText {
    constructor(source) {
        this.original = source;
        this.chunks = [];
        this.offset = 0;
    }

    add(text, at, copied = false) {
        if (!text) return;
        this.chunks.push({text, at, offset: this.offset, copied});
        this.offset += text.length;
    }

    line(text, at) { this.add(text + "\n", at); }

    copy(from, to) { this.add(this.original.slice(from, to), from, true); }

    result(prefix, layout) {
        const source = this.chunks.map(chunk => chunk.text).join("");
        const remap = error => {
            const match = /^(\d+):(\d+): ([\s\S]*)$/.exec(error.message);
            if (!match) return error;
            let offset = 0;
            for (let i = 1; i < Number(match[1]); i++) offset = source.indexOf("\n", offset) + 1;
            offset += Number(match[2]) - 1;
            let low = 0, high = this.chunks.length;
            while (low + 1 < high) {
                const mid = (low + high) >>> 1;
                if (this.chunks[mid].offset <= offset) low = mid;
                else high = mid;
            }
            const chunk = this.chunks[low];
            if (!chunk) return error;
            const at = chunk.at + (chunk.copied ? offset - chunk.offset : 0);
            return new SyntaxError(location(this.original, at) + ": " + match[3]);
        };
        return {source, layout, prefix, remap};
    }
}

function render(program, data) {
    const {tokens, refs} = data;
    if (!tokens.length) return "";
    const parts = [];
    let at = tokens[0].at;
    for (const token of tokens) {
        const binding = refs.get(token.at);
        if (!binding?.alias) continue;
        parts.push(program.source.slice(at, token.at), binding.alias);
        at = token.end;
    }
    parts.push(program.source.slice(at, tokens.at(-1).end));
    return parts.join("");
}

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

const stateField = (frame, kind) => "state." + frame.base + kind;
const call = (name, args) => name + "(" + args.join(", ") + ")";
const formal = ({name, type}) => name + ": " + type;
const signature = (name, params, result) => "function " + name + "(" + params.map(formal).join(", ") + "): " + result + " {";

function encode(value, type) {
    if (type === "i32") return value;
    return "i32(" + value + ")";
}

function decode(program, value, type) {
    if (type === "i32") return value;
    if (type === "bool") return value + " === 1";
    return call(program.prefix + "word_" + type, [value]);
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

function zero(type, types) {
    if (type === "bool") return "false";
    if (types.enums.has(type)) return type + "." + types.enums.get(type).keys().next().value;
    return "0";
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
    const innermost = allocation.frames.filter(frame => frame.fn.waits.some(wait => !wait.callee));
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
    for (const frame of innermost) line("if (" + matches(frame) + ") { " + route + " = " + frame.id + "; }");
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
    const fields = allocation.fields;
    let at = 0;
    if (fields.length) {
        writer.copy(at, program.stateEnd);
        writer.add("\n", program.stateEnd);
        for (const {name, type} of fields) writer.line("    " + name + ": " + type + ";", program.stateEnd);
        at = program.stateEnd;
    }
    for (const fn of program.functions.values()) {
        if (fn.async) {
            writer.copy(at, fn.start);
            at = fn.end;
            continue;
        }
        for (const op of fn.replacements) {
            writer.copy(at, op.at);
            const root = allocation.tasks.get(op.target)?.root;
            let text;
            switch (op.kind) {
            case "start": text = root.base + "start"; break;
            case "cancel": text = call(root.base + "cancel", ["state"]); break;
            case "pending": text = call(program.prefix + "pending", fields.length ? ["state"] : []); break;
            case "resume": text = call(program.prefix + "resume", [...ambient.keys()]); break;
            }
            writer.add(text, op.at);
            at = op.end;
        }
    }
    writer.copy(at, source.length);
    writer.add("\n", source.length);
    for (const frame of allocation.frames) emitStep(program, writer, frame);
    emitTaskOperations(program, writer, allocation);
    return writer.result(program.prefix, allocation.layout);
}

globalThis.typedAsync = {
    analyze(source, imports = []) { return prepare(source, imports)?.allocation.layout ?? null; },
    rewrite,
};
})();
