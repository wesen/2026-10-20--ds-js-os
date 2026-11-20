// Replacement for Lexer.next plus helpers within the typed compiler closure.
function lexerSpace(code) {
    return code === 32 || (code >= 9 && code <= 13) ||
        code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) ||
        code === 0x2028 || code === 0x2029 || code === 0x202f ||
        code === 0x205f || code === 0x3000 || code === 0xfeff;
}

function lexerLetter(code) {
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function lexerDigit(code) {
    return code >= 48 && code <= 57;
}

function lexerHex(code) {
    return lexerDigit(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

function lexerStringEnd(source, start) {
    for (let at = start + 1; at < source.length; at++) {
        const code = source.charCodeAt(at);
        if (code === 34) return at + 1;
        if (code < 32) return start;
        if (code !== 92) continue;
        switch (source.charCodeAt(++at)) {
        case 34: case 47: case 92: case 98: case 102: case 110: case 114: case 116:
            break;
        case 117:
            if (!lexerHex(source.charCodeAt(at + 1)) || !lexerHex(source.charCodeAt(at + 2)) ||
                !lexerHex(source.charCodeAt(at + 3)) || !lexerHex(source.charCodeAt(at + 4))) return start;
            at += 4;
            break;
        default:
            return start;
        }
    }
    return start;
}

function lexerOperatorLength(source, at, code) {
    switch (code) {
    case 61:
        return source.charCodeAt(at + 1) === 61 && source.charCodeAt(at + 2) === 61 ? 3 : 1;
    case 60:
        return source.charCodeAt(at + 1) === 61 ? 2 : 1;
    case 62: {
        const next = source.charCodeAt(at + 1);
        return next === 61 || next === 62 ? 2 : 1;
    }
    case 38: case 124:
        return source.charCodeAt(at + 1) === code ? 2 : 0;
    case 33: case 37: case 40: case 41: case 42: case 43: case 44: case 45:
    case 46: case 47: case 58: case 59: case 123: case 125:
        return 1;
    default:
        return 0;
    }
}

    next() {
        const source = this.source;
        let start = this.offset;
        let code = source.charCodeAt(start);
        while (start < source.length) {
            if (lexerSpace(code)) {
                code = source.charCodeAt(++start);
            } else if (code === 47 && source.charCodeAt(start + 1) === 47) {
                const lf = source.indexOf("\n", start + 2);
                start = lf < 0 ? source.length : lf + 1;
                code = source.charCodeAt(start);
            } else {
                break;
            }
        }

        let end = start;
        let kind;
        if (lexerLetter(code)) {
            kind = "id";
            do {
                code = source.charCodeAt(++end);
            } while (lexerLetter(code) || lexerDigit(code));
        } else if (lexerDigit(code)) {
            kind = "int";
            do {
                code = source.charCodeAt(++end);
            } while (lexerDigit(code));
        } else if (code === 34) {
            kind = "str";
            end = lexerStringEnd(source, start);
        } else {
            kind = "op";
            end += lexerOperatorLength(source, start, code);
        }

        // The sticky pattern can backtrack out of a skipped comment and
        // match "/" as punctuation when the rest contains no token.
        if (end === start) return this.legacyNext();
        this.token.at = start;
        this.token.value = source.slice(start, end);
        this.token.kind = kind;
        this.offset = end;
    }
