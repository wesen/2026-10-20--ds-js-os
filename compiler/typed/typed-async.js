// Generated from compiler/typed/async/ by compiler/typed/async/build.mjs. Edit those files, not this one.
// Lower typed async functions before emission. The reactor owns each frame in WorldState, so only its scalar
// fields survive an event boundary. Runs in a bare QuickJS realm after typed-wasm.js; publishes typedAsync.
(() => {
"use strict";

// ---- async/scan.js
// The whole-program pre-pass: which functions are async, the task operations (start, cancel, pending, resume)
// in every body, the call graph and its acyclicity. The front end streams each function to the backend, so the
// generated functions and the frames must be known before the first ordinary body is compiled.
// Existing typed sources use start and pending as locals and record fields.
const candidate = /\b(?:async|await)\b|\b(?:start|cancel)\b\s*(?:\/\/[^\n]*\n\s*)*[a-zA-Z_]\w*|\b(?:resume|pending)\b\s*(?:\/\/[^\n]*\n\s*)*\(/;
const ambient = new Map([["event", "WorldEvent"], ["state", "WorldState"],
    ["output", "buffer"], ["hints", "buffer"]]);
const completion = 4;
const ordinaryCall = /\/\/[^\n]*|"(?:[^"\\\r\n]|\\.)*"|(?<member>\.\s*(?:\/\/[^\n]*\n\s*)*)?(?<name>\b[a-zA-Z_]\w*)\s*(?:\/\/[^\n]*\n\s*)*\(/g;

function isOperation(tokens, i) {
    const {value} = tokens[i];
    const next = tokens[i + 1];
    if (value === "async" || value === "await") return true;
    if (value === "start" || value === "cancel") return next?.kind === "id";
    if (value === "resume" || value === "pending") return next?.value === "(";
    return false;
}

function startNeedsGuard(tokens, open) {
    // Calls, record loads, and arithmetic can have effects before the wrapper
    // has a chance to reject a busy start. Plain argument words cannot.
    for (let i = open + 1, word = true; i < tokens.length; i++, word = !word) {
        const token = tokens[i];
        if (token.value === ")") return false;
        if (word ? token.kind !== "id" && token.kind !== "int" : token.value !== ",") return true;
    }
    return false;
}

function location(source, at) {
    const prefix = source.slice(0, at);
    return prefix.split("\n").length + ":" + (at - prefix.lastIndexOf("\n"));
}

function fail(source, at, message) {
    throw new SyntaxError(location(source, at) + ": " + message);
}

function tokensFrom(source, from, to) {
    const tokens = [];
    const lex = new typedWasm.Lexer(source, from, to);
    for (; lex.token.kind !== "eof"; lex.next()) {
        lex.token.end = lex.offset;
        tokens.push(lex.token);
    }
    return tokens;
}

// Reuse C-produced lexically valid rows. A null body result requests the old
// candidate regexp and token/operator scan, with the same diagnostic precedence.
function indexedBodies(source, lex, signatures) {
    const index = lex.index;
    if (!index) return null;
    const {rows, symbols} = index;
    const known = new Map(signatures.map(fn => [fn.name, fn.index + 1]));
    const marks = new Uint8Array(symbols.length / 3);
    const targets = new Uint32Array(marks.length);
    let paren = -1, dot = -1;
    for (let cell = 0; cell < symbols.length; cell += 3) {
        const kind = symbols[cell + 2];
        if (kind !== 1 && kind !== 4) continue;
        const ordinal = cell / 3;
        const value = source.slice(symbols[cell], symbols[cell + 1]);
        if (kind === 4) {
            if (value === "(") paren = ordinal;
            if (value === ".") dot = ordinal;
            continue;
        }
        targets[ordinal] = known.get(value) ?? 0;
        if (value === "async" || value === "await") marks[ordinal] = 1;
        else if (value === "start" || value === "cancel") marks[ordinal] = 2;
        else if (value === "resume" || value === "pending") marks[ordinal] = 3;
    }
    return sig => {
        if (sig.async) return null;
        const first = lex.findIndexRow(sig.bodyAt);
        const end = (rows[first + 3] - 1) * 4;
        if (rows[first] !== sig.bodyAt || end <= first || rows[end + 1] !== sig.end) return null;
        const calls = [];
        for (let row = first + 4; row < end; row += 4) {
            const ordinal = rows[row + 2];
            const mark = marks[ordinal], target = targets[ordinal];
            if (!mark && !target) continue;
            const next = rows[row + 6], previous = rows[row - 2];
            // Only the predicate for a task form is needed. The parser handles
            // the complete form, its source-gate regexp, and all errors.
            if (mark === 1 || (mark === 2 && symbols[next * 3 + 2] === 1) ||
                (mark === 3 && next === paren)) return null;
            if (target && next === paren && previous !== dot) {
                // E.g. 1helper() has an identifier token but no regexp word
                // boundary. Comment/literal markers influence the legacy scan
                // selection in these invalid bodies, so preserve that path.
                if (rows[row - 3] === rows[row] && symbols[previous * 3 + 2] === 2) return null;
                calls.push(target - 1, rows[row]);
            }
        }
        return calls;
    };
}

function readProgram(source, imported) {
    const lex = new typedWasm.Lexer(source, 0, source.length, true);
    const recordEnds = new Map();
    const types = typedWasm.parseDeclarations(lex, recordEnds);
    const imports = new Map(imported.map(fn => [fn.name, fn]));
    const signatures = typedWasm.scanSignatures(lex, types.records, new Map(imports), 0,
        types.enums, types.distinct, true);
    const inspectBody = indexedBodies(source, lex, signatures);
    const functions = new Map();
    let foundOperation = false;
    for (const sig of signatures) {
        const {name, result, start, end, bodyAt, async, index} = sig;
        const calls = inspectBody?.(sig) ?? null;
        let tokens;
        if (async || (calls === null && candidate.test(source.slice(bodyAt, end)))) {
            tokens = tokensFrom(source, bodyAt, end);
            foundOperation ||= async || tokens.some((_, i) => isOperation(tokens, i));
        }
        const params = async ? sig.params.map((type, i) => {
            const name = sig.paramNames[i];
            return {type, name, at: sig.paramAts[i], ambient: ambient.get(name) === type};
        }) : null;
        functions.set(name, {name, result, start, end, bodyAt, async, index, tokens, calls, sig,
            params, edges: new Set(), waits: async ? [] : null, bindings: async ? [] : null, replacements: []});
    }
    if (!foundOperation) return null;
    let prefix = "__typed_async_";
    while (source.includes(prefix)) prefix += "_";
    return {source, types, functions, imports, prefix, signatures,
        stateEnd: recordEnds.get("WorldState"), tasks: new Set(),
        stateFields: types.records.get("WorldState")?.size ?? 0};
}

function scalar(type, {enums, distinct}) {
    return type === "i32" || type === "bool" || enums.has(type) || distinct.has(type);
}

function sourceCallables(program) {
    const functions = new Map(program.imports);
    for (const fn of program.functions.values()) {
        if (fn.async) continue;
        functions.set(fn.name, fn.sig);
    }
    return functions;
}

// A synchronous body with no task syntax needs only its call edges here.
// Skip strings, comments, and method syntax without allocating lexer tokens.
function scanOrdinaryCalls(source, fn, functions) {
    ordinaryCall.lastIndex = fn.bodyAt;
    for (let match; (match = ordinaryCall.exec(source)) && match.index < fn.end;) {
        const {name, member} = match.groups;
        if (!name || member) continue;
        const target = functions.get(name);
        if (!target) continue;
        if (target.async)
            fail(source, match.index, "call async function " + name + " with start or await");
        fn.edges.add(target);
    }
}

function scanOperations(program) {
    const {source, functions, tasks} = program;
    for (const fn of functions.values()) {
        const {tokens} = fn;
        if (!tokens) {
            if (fn.calls === null) {
                scanOrdinaryCalls(source, fn, functions);
            } else {
                for (let i = 0; i < fn.calls.length; i += 2) {
                    const target = functions.get(program.signatures[fn.calls[i]].name);
                    if (target.async)
                        fail(source, fn.calls[i + 1], "call async function " + target.name + " with start or await");
                    fn.edges.add(target);
                }
            }
            continue;
        }
        for (let i = 1; i < tokens.length - 1; i++) {
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
                fn.replacements.push({kind: value, at, end: next.end, target,
                    guard: value === "start" && startNeedsGuard(tokens, i + 2)});
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
        if (!fn.async) fn.tokens = null;
    }
    for (const fn of functions.values()) {
        for (const op of fn.replacements) {
            if (op.kind === "cancel" && !tasks.has(op.target))
                fail(source, op.at, "cancel requires a task named by start: " + op.target.name);
            if (op.kind === "resume") for (const task of tasks) fn.edges.add(task);
        }
    }
}

function assertAcyclic({functions}) {
    const signatures = [...functions.values()];
    const edges = signatures.map(fn => [...fn.edges].map(target => target.index));
    typedWasm.checkAcyclic(signatures, edges);
}

// ---- async/body.js
// An async function's body as a statement skeleton (AsyncBody): each expression and simple statement is checked
// by the front end's own FunctionEmitter with its tape writers turned off (TypeChecker); the skeleton keeps
// the bindings each statement uses and defines, for liveness.
// Use the real expression/statement checker over already lexed source tokens.
// Its type and mutability checks do not require allocating instruction bytes.
class TypeChecker extends typedWasm.FunctionEmitter {
    constructor(lex, functions, {records, enums, distinct, aliases}, locals, nextLocal) {
        super(lex, functions, records, undefined, 0, enums, distinct, aliases);
        this.locals = locals;
        this.nextLocal = nextLocal;
        this.code = {push() {}};
    }
    emitConst() {}
    emitIndex() {}
    emitMemory() {}
}

function rangeLexer(source, tokens) {
    const lex = Object.create(typedWasm.Lexer.prototype);
    lex.source = source;
    const at = tokens.at(-1).end;
    let i = 0;
    lex.next = () => { lex.token = tokens[i++] ?? {value: "", kind: "eof", at}; };
    lex.next();
    return lex;
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

    range(end) {
        const from = this.i;
        let depth = 0;
        while (depth || this.value !== end) {
            if (!depth && (this.value === ")" || this.value === "{" || this.value === "}"))
                this.fail("expected " + end);
            if (this.value === "(") depth++;
            if (this.value === ")") depth--;
            this.take();
        }
        return this.tokens.slice(from, this.i);
    }
}

class AsyncBody extends Cursor {
    constructor(program, fn, ordinary) {
        super(program.source, fn.tokens, 1);
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

    emitter(tokens, functions = this.ordinary, declares = false) {
        const lex = rangeLexer(this.source, tokens);
        const locals = declares ? new Map(this.locals) : this.locals;
        return new TypeChecker(lex, functions, this.program.types, locals, this.fn.bindings.length);
    }

    references(tokens) {
        const refs = new Map();
        for (let i = 0; i < tokens.length; i++) {
            const binding = this.locals.get(tokens[i].value);
            if (binding && tokens[i - 1]?.value !== "." && tokens[i + 1]?.value !== "(" && tokens[i + 1]?.value !== ":")
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
            rangeLexer(this.source, [binding]).ident();
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
        const emitter = this.emitter(tokens, undefined, declaration);
        const assignment = !declaration && syntax[1]?.value === "=";
        const equals = syntax.findIndex(token => token.value === "=");
        const data = this.references(declaration || assignment ? syntax.slice(equals + 1) : syntax);
        if (semicolon) emitter.statement(this.fn.result);
        else emitter.assignment(emitter.lex.ident());
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
        return this.inScope(() => {
            this.expect("{");
            const nodes = [];
            while (!this.accept("}")) nodes.push(this.statement());
            return nodes;
        });
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
        if (++this.depth > 128) this.fail("async statement nesting limit exceeded");
        const node = this.readStatement();
        this.depth--;
        return node;
    }

    readStatement() {
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
        if (this.accept("match")) {
            this.expect("(");
            const value = this.expression(this.range(")"));
            this.expect(")");
            const members = this.program.types.enums.get(value.type);
            if (!members) this.fail("expected an enum value in match", at);
            this.expect("{");
            const seen = new Set(), arms = [];
            while (!this.accept("}")) {
                const names = [];
                do {
                    const member = this.take();
                    if (!members.has(member.value)) this.fail("unknown enum member " + member.value, member.at);
                    if (seen.has(member.value)) this.fail("useless case " + member.value, member.at);
                    seen.add(member.value);
                    names.push(member.value);
                } while (this.accept(","));
                this.expect(":");
                arms.push({names, body: this.body()});
            }
            const missing = [...members.keys()].filter(name => !seen.has(name));
            if (missing.length) this.fail("match on " + value.type + " does not cover: " + missing.join(", "), at);
            return {kind: "match", at, value, arms,
                hasWait: arms.some(({body}) => contains(body, "hasWait")),
                exits: arms.some(({body}) => contains(body, "exits"))};
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
        while (this.i < this.tokens.length - 1) statements.push(this.statement());
        if (statements.at(-1)?.kind !== "return")
            this.fail("expected a final return", this.token.at);
        return statements;
    }
}

// ---- async/liveness.js
// Liveness over the statement skeleton: the bindings live after each wait, which a frame saves in WorldState.
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
    case "match": {
        const uses = new Set(node.value.uses);
        for (const {body} of node.arms)
            for (const binding of liveSequence(body, out, loopExit)) uses.add(binding);
        return uses;
    }
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
        fn.tokens = null;
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

// ---- async/allocate.js
// Frames in WorldState: one per task and async function it reaches, with state, token, the saved scalars and,
// for a function awaited from two places, its caller; and the asyncLayout the backends publish.
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

// ---- async/text.js
// The lowered program as chunks: copied ranges of the original source and generated text, each with the original
// position diagnostics report (originalAt); and the text helpers of the generated functions.
class GeneratedText {
    constructor(source) {
        this.original = source;
        this.chunks = [];
        this.offset = 0;
    }

    add(text, at, copied = false) {
        if (!text) return;
        this.chunks.push({text, at, offset: this.offset, copied, length: text.length});
        this.offset += text.length;
    }

    line(text, at) { this.add(text + "\n", at); }

    copy(from, to) {
        if (from >= to) return;
        this.chunks.push({at: from, offset: this.offset, copied: true, length: to - from});
        this.offset += to - from;
    }

    range(from, to) {
        const parts = [];
        for (const chunk of this.chunks) {
            const first = Math.max(from, chunk.offset);
            const last = Math.min(to, chunk.offset + chunk.length);
            if (last <= first) continue;
            const begin = first - chunk.offset;
            const end = last - chunk.offset;
            parts.push(chunk.copied ? this.original.slice(chunk.at + begin, chunk.at + end) : chunk.text.slice(begin, end));
        }
        return parts.join("");
    }

    // The original source position of an offset in the lowered program: within a copied chunk the same character,
    // within generated text the statement the chunk was generated for.
    originalAt(offset) {
        let low = 0, high = this.chunks.length;
        while (low + 1 < high) {
            const mid = (low + high) >>> 1;
            if (this.chunks[mid].offset <= offset) low = mid;
            else high = mid;
        }
        const chunk = this.chunks[low];
        return chunk.at + (chunk.copied ? offset - chunk.offset : 0);
    }

    result(prefix, layout) {
        let whole;
        const writer = this;
        return {get source() { return whole ??= writer.range(0, writer.offset); }, layout, prefix,
            originalAt: offset => writer.originalAt(offset)};
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

// ---- async/lower.js
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

// ---- async/tasks.js
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

// ---- async/rewrite.js
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
})();
