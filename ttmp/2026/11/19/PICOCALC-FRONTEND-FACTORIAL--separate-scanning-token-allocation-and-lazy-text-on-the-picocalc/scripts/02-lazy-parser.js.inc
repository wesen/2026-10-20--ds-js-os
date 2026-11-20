    // Most grammar probes recognize fixed spelling without creating a string.
    is(value) {
        const { at, end } = this.token;
        return end - at === value.length && this.source.startsWith(value, at);
    }

    text() {
        if (this.tokenText === undefined)
            this.tokenText = this.source.slice(this.token.at, this.token.end);
        return this.tokenText;
    }

    binaryOperator() {
        const { kind, at, end } = this.token;
        if (kind !== "op") return;
        const length = end - at;
        const source = this.source;
        // The scanner has already validated each multi-character spelling.
        switch (source.charCodeAt(at)) {
        case 124: return "||";
        case 38: return "&&";
        case 61: if (length === 3) return "==="; return;
        case 60: return length === 2 ? "<=" : "<";
        case 62:
            if (length === 1) return ">";
            return source.charCodeAt(at + 1) === 62 ? ">>" : ">=";
        case 43: return "+";
        case 45: return "-";
        case 42: return "*";
        case 47: return "/";
        case 37: return "%";
        }
    }
