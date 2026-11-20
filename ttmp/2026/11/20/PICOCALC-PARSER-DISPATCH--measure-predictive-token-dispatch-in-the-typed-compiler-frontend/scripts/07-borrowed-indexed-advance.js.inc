    nextWholeIndexed() {
        const row = this.indexRow;
        const {rows, symbols, spellings} = this.index;
        if (this.offset !== this.indexOffset || row >= rows.length) return this.nextIndexed();
        const ordinal = rows[row + 2];
        let symbol = spellings[ordinal];
        if (symbol === undefined) {
            const cell = ordinal * 3;
            symbol = {
                value: this.source.slice(symbols[cell], symbols[cell + 1]),
                kind: indexKinds[symbols[cell + 2]],
            };
            spellings[ordinal] = symbol;
        }
        const token = this.token;
        token.value = symbol.value;
        token.kind = symbol.kind;
        token.at = rows[row];
        this.offset = this.indexOffset = rows[row + 1];
        this.indexRow = row + 4;
    }

