// The staged loader installs this table and borrows one token internally.
const ASCII = new Uint8Array(128);
for (const ch of "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_") ASCII[ch.charCodeAt(0)] = 1;
for (const ch of "0123456789") ASCII[ch.charCodeAt(0)] = 2;
for (let ch = 9; ch <= 13; ch++) ASCII[ch] = 3;
ASCII[32] = 3;
for (const ch of "{}():;,.+-*/%") ASCII[ch.charCodeAt(0)] = 4;
for (const ch of "!=<>&|") ASCII[ch.charCodeAt(0)] = 5;

    scanCurrent() {
        const source = this.source;
        let at = this.offset;
        if ((at | 0) !== at || at >= this.end) return Lexer.prototype.next.call(this);
        let ch = source.charCodeAt(at), tag = ASCII[ch];
        for (;;) {
            if (tag === 3) {
                at++;
            } else if (ch === 47 && source.charCodeAt(at + 1) === 47) {
                const newline = source.indexOf("\n", at + 2);
                if (newline < 0) return Lexer.prototype.next.call(this);
                at = newline + 1;
            } else {
                break;
            }
            ch = source.charCodeAt(at);
            tag = ASCII[ch];
        }
        let end = at + 1, kind = "op";
        if (tag === 1) {
            kind = "id";
            let following;
            while ((following = ASCII[source.charCodeAt(end)]) === 1 || following === 2) end++;
        } else if (tag === 2) {
            kind = "int";
            while (ASCII[source.charCodeAt(end)] === 2) end++;
        } else if (tag === 5) {
            const following = source.charCodeAt(end);
            switch (ch) {
            case 33: case 61:
                if (following === 61 && source.charCodeAt(end + 1) === 61) end += 2;
                break;
            case 60:
                if (following === 61) end++;
                break;
            case 62:
                if (following === 61 || following === 62) end++;
                break;
            default:
                if (following !== ch) return Lexer.prototype.next.call(this);
                end++;
            }
        } else if (tag !== 4) {
            // Preserve string/Unicode matching and terminal-comment backtracking.
            return Lexer.prototype.next.call(this);
        }
        if (end > this.end) return Lexer.prototype.next.call(this);
        const token = this.token;
        token.value = source.slice(at, end);
        token.kind = kind;
        token.at = at;
        this.offset = end;
    }
