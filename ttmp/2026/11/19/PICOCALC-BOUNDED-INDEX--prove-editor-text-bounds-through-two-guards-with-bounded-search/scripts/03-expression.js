    expr(minPrecedence = 0) {
        if (++this.depth > 128) this.lex.fail("expression nesting limit exceeded");
        this.term = undefined;
        const initialEffect = this.bounds?.effect;
        let type = this.prefix();
        let term = this.term;
        while (true) {
            const op = this.lex.token.value;
            const rule = BINARY.get(op);
            if (!rule || rule[0] < minPrecedence) break;
            const [precedence, input, result, opcode] = rule;
            if (!input && type !== "i32" && type !== "bool") this.lex.fail("expected scalar equality operands");
            const expected = input ?? type;
            this.want(type, expected);
            this.lex.next();
            if (op === "&&" || op === "||") {
                const before = this.bounds?.facts;
                this.branchIf(I32);
                if (op === "&&") {
                    this.bounds?.assume(term);
                    this.want(this.expr(precedence + 1), "bool");
                    if (this.bounds && this.bounds.effect === initialEffect) {
                        const right = Array.isArray(this.term) ? this.term : [];
                        term = Array.isArray(term) ? term.concat(right.slice(0, FACT_LIMIT - term.length)) : right;
                    }
                    else term = undefined;
                    this.code.push(OP.else);
                    this.emitConst(0);
                } else {
                    this.emitConst(1);
                    this.code.push(OP.else);
                    this.want(this.expr(precedence + 1), "bool");
                    term = undefined;
                }
                this.code.push(OP.end);
                this.bounds?.logicalJoin(before);
            } else {
                this.want(this.expr(precedence + 1), expected);
                term = this.bounds?.effect === initialEffect ? this.bounds?.compare(op, term, this.term) : undefined;
                this.emitBinary(opcode);
            }
            type = result;
        }
        this.term = term;
        this.depth--;
        return type;
    }
