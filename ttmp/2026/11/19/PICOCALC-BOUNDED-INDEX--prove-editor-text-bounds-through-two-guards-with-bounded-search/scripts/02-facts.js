const FACT_LIMIT = 24;
const SEARCH_LIMIT = 8;
const LOOP_SCAN_LIMIT = 2048;

class BoundsFacts {
    constructor() {
        this.versions = [];
        this.nextVersion = 0;
        this.facts = [];
        this.effect = 0;
        this.proven = 0;
        this.exhausted = 0;
        this.examined = 0;
    }

    local(index, type) {
        if (type === "i32" || type === "string" || type === "buffer")
            this.assign(index);
    }

    assign(index) {
        const previous = this.versions[index];
        if (previous !== undefined) {
            this.facts = this.facts.filter(({left, right}) =>
                left !== previous && left !== previous + 1 && right !== previous && right !== previous + 1);
        }
        this.versions[index] = 2 * this.nextVersion++ + 1;
    }

    scalar(binding) {
        return binding.type === "i32" ? this.versions[binding.index] : undefined;
    }

    length(binding) { return this.versions[binding.index] + 1; }

    forget() {
        this.effect++;
        this.facts = [];
    }

    compare(op, left, right) {
        if (typeof left !== "number" || typeof right !== "number") return;
        if (op === "<" || op === "<=") return [{left, right, strict: op === "<"}];
        if (op === ">" || op === ">=") return [{left: right, right: left, strict: op === ">"}];
    }

    assume(term) {
        if (!Array.isArray(term) || this.facts.length === FACT_LIMIT) return;
        const room = FACT_LIMIT - this.facts.length;
        this.facts = this.facts.concat(term.slice(0, room));
    }

    checkpoint() { return {facts: this.facts, versions: this.versions.slice()}; }

    join(entry) {
        const surviving = new Set(this.facts);
        this.facts = entry.facts.filter(fact => surviving.has(fact));
        for (let i = 0; i < entry.versions.length; i++) {
            if (entry.versions[i] !== undefined && entry.versions[i] !== this.versions[i])
                this.assign(i);
        }
    }

    logicalJoin(before) {
        const surviving = new Set(this.facts);
        this.facts = before.filter(fact => surviving.has(fact));
    }

    beginLoop(locals, lex) {
        for (const binding of locals.values()) {
            if (binding.mutable) this.assign(binding.index);
        }
        const length = term => term !== 0 && term % 2 === 0;
        if (this.facts.some(fact => length(fact.left) || length(fact.right)) && !effectFreeLoop(lex))
            this.facts = this.facts.filter(fact => !length(fact.left) && !length(fact.right));
        return this.checkpoint();
    }

    proves(index, length) {
        if (typeof index !== "number" || !this.facts.length) return false;
        const intermediates = [];
        let budget = SEARCH_LIMIT;
        let lower = index === 0;
        let direct = false;
        const examine = () => {
            if (!budget) {
                this.exhausted++;
                return false;
            }
            budget--;
            this.examined++;
            return true;
        };
        for (const edge of this.facts) {
            if (!examine()) return false;
            if (edge.left === 0 && edge.right === index) lower = true;
            if (edge.left === index && edge.right === length && edge.strict) direct = true;
            else if (FACT_POLICY === "bounded" && edge.left === index) intermediates.push(edge);
            if (lower && direct) {
                this.proven++;
                return true;
            }
        }
        if (!lower) return false;
        for (const first of intermediates) {
            for (const second of this.facts) {
                if (!examine()) return false;
                if (first.right === second.left && second.right === length && (first.strict || second.strict)) {
                    this.proven++;
                    return true;
                }
            }
        }
        return false;
    }
}

// The lexer resets TOKEN.lastIndex on each next(), so this cursor can share the
// scanner without moving the real parser. The actual parse owns diagnostics.
function effectFreeLoop(lex) {
    const look = Object.assign(Object.create(Lexer.prototype), lex);
    let previous, qualifier, parentheses = 0, braces = 0, body = false;
    try {
        for (let inspected = 0; inspected < LOOP_SCAN_LIMIT && look.token.kind !== "eof"; inspected++) {
            const token = look.token.value;
            if (token === "(") {
                if (previous?.kind === "id" && previous.value !== "if" && previous.value !== "while") {
                    const intrinsic = qualifier === "." && ["charCodeAt", "setCharCodeAt", "writeLiteral", "min", "max"].includes(previous.value);
                    if (!intrinsic) return false;
                }
                parentheses++;
            } else if (token === ")") {
                parentheses--;
            } else if (token === "{" && !parentheses) {
                body = true;
                braces++;
            } else if (token === "}" && body) {
                if (--braces === 0) return true;
            } else if (token === "=" && qualifier === ".") {
                return false;
            }
            qualifier = previous?.value;
            previous = look.token;
            look.next();
        }
    } catch {
        return false;
    }
    return false;
}
