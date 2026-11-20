    expr(minPrecedence = 0, conditionMode = false) {
        if (++this.depth > 128) this.lex.fail("expression nesting limit exceeded");
        const start = this.code.length;
        this.term = undefined;
        const initialEffect = this.bounds?.effect;
        let left = this.prefix(conditionMode);
        let term = this.term;
        while (true) {
            const op = this.lex.token.value;
            const rule = BINARY.get(op);
            if (!rule || rule[0] < minPrecedence) break;
            const [precedence, input, result, opcode] = rule;
            const type = this.exprType(left);
            if (!input && type !== "i32" && type !== "bool") this.lex.fail("expected scalar equality operands");
            const expected = input ?? type;
            this.want(type, expected);
            this.lex.next();
            if (op === "&&" || op === "||") {
                const before = this.bounds?.facts;
                const isAnd = op === "&&";
                const first = conditionMode ? this.captureCondition(left, start) : null;
                if (!conditionMode) {
                    this.branchIf(I32);
                    if (!isAnd) {
                        this.emitConst(1);
                        this.code.push(OP.else);
                    }
                }
                if (isAnd) this.bounds?.assume(term);
                const next = this.expr(precedence + 1, conditionMode);
                this.want(this.exprType(next), "bool");
                if (isAnd && this.bounds && this.bounds.effect === initialEffect) {
                    const right = Array.isArray(this.term) ? this.term : [];
                    term = Array.isArray(term) ? term.concat(right.slice(0, FACT_LIMIT - term.length)) : right;
                } else {
                    term = undefined;
                }
                this.bounds?.logicalJoin(before);
                if (conditionMode) {
                    left = {op, left: first, right: this.captureCondition(next, start)};
                    continue;
                }
                if (isAnd) {
                    this.code.push(OP.else);
                    this.emitConst(0);
                }
                this.code.push(OP.end);
            } else {
                if (typeof left !== "string") this.emitCondition(left, null, 0);
                this.want(this.expr(precedence + 1), expected);
                term = this.bounds?.effect === initialEffect ? this.bounds?.compare(op, term, this.term) : undefined;
                this.emitBinary(opcode);
            }
            left = result;
        }
        this.term = term;
        this.depth--;
        return left;
    }
