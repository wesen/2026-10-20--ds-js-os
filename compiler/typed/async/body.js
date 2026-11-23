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
