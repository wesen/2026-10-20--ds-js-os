// The front end's parser and type checker, part two: blocks, conditionals, loops, match, declarations and
// assignments, and one function's body. typed-async.js (async/body.js) subclasses FunctionEmitter as its TypeChecker.

// Whether a loop body that starts after the `{` at `from` contains the word continue (outside comments and strings).
// Nested loops' continues count too: an unneeded continue block costs no instruction. One test per source decides
// whether any body needs the scan, so a program without continue pays one search per source.
const CONTINUE_SCAN = /[{}]|\/\/[^\n]*|"(?:[^"\\\n]|\\[^\n])*"|\bcontinue\b/g;
let continueSource = null, continueFound = false;
function bodyContinues(source, from) {
    if (source !== continueSource) {
        continueSource = source;
        continueFound = source.includes("continue");
    }
    if (!continueFound) return false;
    CONTINUE_SCAN.lastIndex = from;
    for (let depth = 1, token; (token = CONTINUE_SCAN.exec(source));) {
        if (token[0] === "{") depth++;
        else if (token[0] === "}") { if (--depth === 0) return false; }
        else if (token[0] === "continue") return true;
    }
    return false;
}

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
        if (lex.accept("setF32")) {
            lex.expect("(");
            this.floatAddress(receiver);
            lex.expect(",");
            this.want(this.expr(), "f32");
            lex.expect(")");
            this.code.push(F32_STORE, 2, 2);
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
        const initAt = this.code.length;
        if (counted) {
            this.locals = new Map(enclosing);
            if (lex.token.value === "let") this.declaration();
            else this.assignment(lex.ident());
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
        }
        // Expression control blocks close within expr(), before any break can appear. A loop is
        //     block; loop; C; eqz; br_if 1; B; [update]; br 0; end; end
        // and break is a br to the outer block. When the body has a continue, B is block; B; end and continue is a br
        // to that block's end, which reaches the update and the back edge: a br to the loop itself would skip the
        // update, and the condition once the rotate pass has moved it to the bottom.
        const exit = this.controls;
        this.loopExits.push(exit);
        this.controls += 2;
        this.code.push(BLOCK, VOID, LOOP, VOID);
        const conditionAt = this.code.length;
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
        // A counted loop's range proof removes its counter's array checks (frontend/arrays.js) when it holds.
        const proof = counted && this.arrayBytes ? this.countedRange(initAt, conditionAt, update) : null;
        if (proof) (this.countedLoops ??= []).push(proof);
        const bodyAt = this.code.length;
        const continues = lex.token.value === "{" && bodyContinues(lex.source, lex.offset);
        (this.loopContinues ??= []).push(continues ? exit + 2 : -1);
        if (continues) {
            this.code.push(BLOCK, VOID);
            this.controls++;
        }
        this.block(result);
        if (continues) {
            this.code.push(END);
            this.controls--;
        }
        this.loopContinues.pop();
        if (proof) {
            this.countedLoops.pop();
            this.proveChecks(proof, bodyAt);
        }
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
        const annotation = (lex.token.value === ":" && (lex.next(), true)) ? lex.type(this.records, this.enums, this.distinct, this.values) : null;
        if (mutable && annotation !== null && lex.isGeneratedLocal?.(id) && lex.token.value === ";") {
            // Every continuation path reaches the original initializer or a reload
            // before reading this slot, including on targets with uninitialized frames.
            this.local(id, annotation, true);
            return;
        }
        { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
        if (lex.token.value === "new") return this.arrayDeclaration(id, annotation);
        const type = this.expr();
        if (annotation !== null) this.want(type, annotation);
        const declared = annotation ?? scalarType(type);
        if (this.values?.has(declared)) this.setLeaves(declared, this.valueLocal(id, declared, mutable));
        else this.emitIndex(LOCAL_SET, this.local(id, declared, mutable));
    }

    assignment(id, statement = false) {
        const lex = this.lex;
        const local = this.locals.get(id);
        if (!local) lex.fail("unknown local " + id);
        if (this.values?.has(local.type)) return this.valueAssignment(id, local, statement);
        if (local.array) return this.arrayAssignment(local.array, statement);
        if (statement && (lex.token.value === "." && (lex.next(), true))) {
            if (local.type === "buffer") this.bufferWrite(local.index);
            else {
                const name = lex.ident();
                this.emitIndex(LOCAL_GET, local.index);
                if (lex.token.value === "(") {
                    let type = this.memberCall(this.aliases?.methods.get(local.type), local.type, true, name);
                    if (lex.token.value === ".") type = this.postfix(type);
                    this.drop(type);
                    return;
                }
                const field = this.field(local.type, name);
                { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
                this.want(this.expr(), field.type);
                this.emitMemory(field.type === "f32" ? F32_STORE : I32_STORE, 2, field.offset);
            }
        } else {
            if (!local.mutable) lex.fail("expected mutable local " + id);
            { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
            this.want(this.expr(), local.type);
            this.emitIndex(LOCAL_SET, local.index);
        }
    }

    // An assignment to a value record local or a part of it: v = e, v.f = e, v.o.f = e (a mutable local), a store
    // through a record reference it holds (v.r.f = e), a method call on a part of it, or a buffer write.
    valueAssignment(id, local, statement) {
        const lex = this.lex;
        let type = local.type, index = local.index;
        while (statement && this.values.has(type) && lex.token.value === ".") {
            lex.next();
            const name = lex.ident();
            if (lex.token.value === "(") {
                this.pushLeaves(type, index);
                let result = this.memberCall(this.aliases?.methods.get(type), type, true, name);
                if (lex.token.value === ".") result = this.postfix(result);
                this.drop(result);
                return;
            }
            const field = this.valueField(type, name);
            type = field.type;
            index += field.offset;
        }
        if (statement && lex.accept(".")) {
            if (type === "buffer") return this.bufferWrite(index);
            const name = lex.ident();
            this.emitIndex(LOCAL_GET, index);
            if (lex.token.value === "(") {
                let result = this.memberCall(this.aliases?.methods.get(type), type, true, name);
                if (lex.token.value === ".") result = this.postfix(result);
                this.drop(result);
                return;
            }
            const field = this.field(type, name);
            lex.expect("=");
            this.want(this.expr(), field.type);
            this.emitMemory(field.type === "f32" ? F32_STORE : I32_STORE, 2, field.offset);
            return;
        }
        if (!local.mutable) lex.fail("expected mutable local " + id);
        lex.expect("=");
        this.want(this.expr(), type);
        this.setLeaves(type, index);
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
        case "continue": {
            lex.next();
            const target = this.loopContinues?.at(-1);
            if (target === undefined) lex.fail("continue outside a loop");
            if (target < 0) lex.fail("continue the loop's body scan did not find");
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            this.emitIndex(BR, this.controls - target - 1);
            return;
        }
        case "const": case "let":
            this.declaration();
            break;
        default: {
            const id = lex.ident();
            if ((lex.token.value === "(" && (lex.next(), true))) {
                let type = this.call(id);
                if (lex.token.value === ".") type = this.postfix(type);
                this.drop(type); // drop the unused call result
            } else if (!this.locals.has(id) && this.aliases?.namespaces.has(id)) {
                lex.expect(".");
                let type = this.memberCall(this.aliases.namespaces.get(id), id, false);
                if (lex.token.value === ".") type = this.postfix(type);
                this.drop(type);
            } else {
                this.assignment(id, true);
            }
        }
        }
        { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
    }

    function(fn) {
        const lex = this.lex;
        const {params, paramNames, result, sourceParams} = fn;
        // A value record parameter is its leaves, consecutive parameters: one value local.
        if (sourceParams) for (let i = 0; i < sourceParams.length; i++) {
            if (this.values?.has(sourceParams[i])) this.valueLocal(fn.sourceNames[i], sourceParams[i], false);
            else this.local(fn.sourceNames[i], sourceParams[i]);
        }
        else for (let i = 0; i < params.length; i++) this.local(paramNames[i], params[i]);
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
        if (this.arrayBytes) fn.arrayBytes = this.arrayBytes;
        // fn.localTypes: the type class of each frame local ("f32" or "i32"), only when one is an f32; the RV32
        // planner and the Wasm local declarations read it.
        const params = fn.params.length;
        const floats = this.floatLocals?.filter(index => index >= params);
        if (floats?.length) {
            fn.localTypes = Array(fn.nlocals).fill("i32");
            for (const index of floats) fn.localTypes[index - params] = "f32";
        }
        return fn;
    }
}
