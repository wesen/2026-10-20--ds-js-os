// The front end's parser and type checker, part two: blocks, conditionals, loops, match, declarations and
// assignments, and one function's body. typed-async.js subclasses FunctionEmitter as its TypeChecker.
class FunctionEmitter extends ExpressionParser {
    result(type, branch) {
        { if (this.lex.token.value !== "return") this.lex.fail("expected return"); this.lex.next(); }
        this.want(this.expr(), type);
        { if (this.lex.token.value !== ";") this.lex.fail("expected ;"); this.lex.next(); }
        if (branch) this.code.push(RETURN);
    }

    bufferWrite(receiver) {
        const lex = this.lex;
        if ((lex.token.value === "writeLiteral" && (lex.next(), true))) {
            this.bufferLiteral(receiver);
            return;
        }
        { if (lex.token.value !== "setCharCodeAt") lex.fail("expected setCharCodeAt"); lex.next(); }
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        const position = this.nextLocal++;
        this.want(this.expr(), "i32");
        this.emitIndex(LOCAL_SET, position);
        { if (lex.token.value !== ",") lex.fail("expected ,"); lex.next(); }
        this.codeUnitAddress(receiver, position);
        this.want(this.expr(), "i32");
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        this.code.push(I32_STORE16, 1, 4); // i32.store16 into the buffer's data after its capacity
    }

    block(result) {
        if (++this.depth > 128) this.lex.fail("block nesting limit exceeded");
        { if (this.lex.token.value !== "{") this.lex.fail("expected {"); this.lex.next(); }
        const enclosing = this.locals;
        this.locals = new Map(enclosing);
        while (!(this.lex.token.value === "}" && (this.lex.next(), true))) this.statement(result);
        this.locals = enclosing;
        this.depth--;
    }

    conditional(result) {
        const lex = this.lex;
        const enclosing = this.controls;
        do {
            if (this.controls - enclosing + this.depth >= 128) lex.fail("block nesting limit exceeded");
            { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
            this.want(this.expr(), "bool");
            { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
            this.code.push(IF, VOID);
            this.controls++;
            if (lex.token.value === "{") this.block(result);
            else this.result(result, true);
            if (!(lex.token.value === "else" && (lex.next(), true))) break;
            this.code.push(ELSE);
            if ((lex.token.value === "if" && (lex.next(), true))) continue;
            if (lex.token.value === "{") this.block(result);
            else this.result(result, true);
            break;
        } while (true);
        while (this.controls > enclosing) {
            this.code.push(END);
            this.controls--;
        }
    }

    loop(result, counted) {
        const lex = this.lex;
        const enclosing = this.locals;
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        if (counted) {
            this.locals = new Map(enclosing);
            if (lex.token.value === "let") this.declaration();
            else this.assignment(lex.ident());
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
        }
        // Expression control blocks close within expr(), before any break can appear.
        this.loopExits.push(this.controls);
        this.controls += 2;
        this.code.push(BLOCK, VOID, LOOP, VOID);
        this.want(this.expr(), "bool");
        this.code.push(I32_EQZ, BR_IF, 1);
        let update;
        if (counted) {
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            const loopCode = this.code;
            this.code = this.inspection ? this.inspection.tape() : [];
            this.assignment(lex.ident());
            update = this.code;
            this.code = loopCode;
        }
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        this.block(result);
        if (update) {
            if (this.inspection) this.code.append(update);
            else for (const cell of update) this.code.push(cell);
        }
        this.code.push(BR, 0, END, END);
        this.controls -= 2;
        this.loopExits.pop();
        this.locals = enclosing;
    }

    declaration() {
        const lex = this.lex;
        const mutable = lex.token.value === "let";
        lex.next();
        const id = lex.ident();
        const annotation = (lex.token.value === ":" && (lex.next(), true)) ? lex.type(this.records, this.enums, this.distinct) : null;
        if (mutable && annotation !== null && lex.isGeneratedLocal?.(id) && lex.token.value === ";") {
            // Every continuation path reaches the original initializer or a reload
            // before reading this slot, including on targets with uninitialized frames.
            this.local(id, annotation, true);
            return;
        }
        { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
        const type = this.expr();
        if (annotation !== null) this.want(type, annotation);
        this.emitIndex(LOCAL_SET, this.local(id, annotation ?? scalarType(type), mutable));
    }

    assignment(id, statement = false) {
        const lex = this.lex;
        const local = this.locals.get(id);
        if (!local) lex.fail("unknown local " + id);
        if (statement && (lex.token.value === "." && (lex.next(), true))) {
            if (local.type === "buffer") this.bufferWrite(local.index);
            else {
                const name = lex.ident();
                this.emitIndex(LOCAL_GET, local.index);
                if (lex.token.value === "(") {
                    const type = this.memberCall(this.aliases?.methods.get(local.type), local.type, true, name);
                    if (lex.token.value === ".") this.postfix(type);
                    this.code.push(DROP);
                    return;
                }
                const field = this.field(local.type, name);
                { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
                this.want(this.expr(), field.type);
                this.emitMemory(I32_STORE, 2, field.offset);
            }
        } else {
            if (!local.mutable) lex.fail("expected mutable local " + id);
            { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
            this.want(this.expr(), local.type);
            this.emitIndex(LOCAL_SET, local.index);
        }
    }

    matchGroup(slot, values) {
        // A contiguous interval can be compared with one unsigned bound check,
        // including when the declared values cross zero or reach i32's limits.
        values.sort((a, b) => a - b);
        let joins = 0;
        for (let i = 0; i < values.length;) {
            const first = values[i++];
            let last = first;
            while (values[i] === last + 1) last = values[i++];
            if (first === last) {
                this.emitIndex(LOCAL_GET, slot);
                this.emitConst(first);
                this.code.push(I32_EQ);
            } else {
                this.emitConst((last - first) | 0);
                this.emitIndex(LOCAL_GET, slot);
                if (first !== 0) {
                    this.emitConst(first);
                    this.code.push(I32_SUB);
                }
                this.code.push(I32_GE_U);
            }
            if (i < values.length) {
                this.code.push(IF, I32);
                this.emitConst(1);
                this.code.push(ELSE);
                joins++;
            }
        }
        while (joins-- > 0) this.code.push(END);
    }

    match(result) {
        const lex = this.lex;
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        const type = this.expr();
        const members = this.enums.get(type);
        if (!members) lex.fail("match requires an enum, got " + scalarType(type));
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        const slot = this.nextLocal++;
        this.emitIndex(LOCAL_SET, slot);
        { if (lex.token.value !== "{") lex.fail("expected {"); lex.next(); }
        const seen = new Set();
        const enclosing = this.controls;
        while (!(lex.token.value === "}" && (lex.next(), true))) {
            const values = [];
            do {
                const member = lex.ident();
                if (!members.has(member)) lex.fail("unknown case " + member + " in " + type);
                if (seen.has(member)) lex.fail("useless case " + member);
                seen.add(member);
                values.push(members.get(member));
            } while ((lex.token.value === "," && (lex.next(), true)));
            { if (lex.token.value !== ":") lex.fail("expected :"); lex.next(); }
            this.matchGroup(slot, values);
            this.code.push(IF, VOID);
            this.controls++;
            this.block(result);
            this.code.push(ELSE);
        }
        const missing = [...members.keys()].filter(member => !seen.has(member));
        if (missing.length) lex.fail("match on " + type + " does not cover: " + missing.join(", "));
        this.code.push(UNREACHABLE); // A raw ABI word outside the declared domain traps.
        while (this.controls > enclosing) {
            this.code.push(END);
            this.controls--;
        }
    }

    statement(result) {
        const lex = this.lex;
        switch (lex.token.value) {
        case "if":
            lex.next();
            this.conditional(result);
            return;
        case "match":
            lex.next();
            this.match(result);
            return;
        case "return":
            this.result(result, true);
            return;
        case "while":
            lex.next();
            this.loop(result, false);
            return;
        case "for":
            lex.next();
            this.loop(result, true);
            return;
        case "break": {
            lex.next();
            const exit = this.loopExits.at(-1);
            if (exit === undefined) lex.fail("break outside a loop");
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            this.emitIndex(BR, this.controls - exit - 1);
            return;
        }
        case "const": case "let":
            this.declaration();
            break;
        default: {
            const id = lex.ident();
            if ((lex.token.value === "(" && (lex.next(), true))) {
                const type = this.call(id);
                if (lex.token.value === ".") this.postfix(type);
                this.code.push(DROP); // drop the unused call result
            } else if (!this.locals.has(id) && this.aliases?.namespaces.has(id)) {
                lex.expect(".");
                const type = this.memberCall(this.aliases.namespaces.get(id), id, false);
                if (lex.token.value === ".") this.postfix(type);
                this.code.push(DROP);
            } else {
                this.assignment(id, true);
            }
        }
        }
        { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
    }

    function(fn) {
        const lex = this.lex;
        const {params, paramNames, result} = fn;
        for (let i = 0; i < params.length; i++) this.local(paramNames[i], params[i]);
        lex.offset = fn.bodyAt;
        lex.next();
        { if (lex.token.value !== "{") lex.fail("expected {"); lex.next(); }
        while (lex.token.value !== "return") this.statement(result);
        this.result(result, false);
        { if (lex.token.value !== "}") lex.fail("expected }"); lex.next(); }
        this.code.push(END);
        fn.nlocals = this.nextLocal - params.length;
        fn.code = this.code;
        return this.finish(fn);
    }

    finish(fn) {
        if (this.literals) fn.literals = this.literals;
        return fn;
    }
}
