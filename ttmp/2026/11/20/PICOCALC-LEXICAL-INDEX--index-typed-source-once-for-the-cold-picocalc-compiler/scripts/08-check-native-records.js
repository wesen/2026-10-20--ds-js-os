// Run with the unchanged Lexer and native producer in the same QuickJS context.
(() => {
    const kinds = [null, "id", "int", "str", "op"];
    let checked = 0, total = 0, declined = 0;
    function check(source, requireIndex = true) {
        const data = __typedLexIndex(source);
        if (data === null) {
            declined++;
            if (requireIndex) throw new Error("unexpected index refusal: "+source.slice(0,60));
            return;
        }
        const rows = new Uint32Array(data[0]), symbols = new Uint32Array(data[1]);
        if (rows.length % 4 || symbols.length % 3) throw new Error("invalid table alignment");
        const lexer = new typedWasm.Lexer(source);
        const opened = [], ids = new Map();
        for (let i = 0; i < rows.length; i += 4) {
            const [start,end,id,closing] = rows.subarray(i,i+4);
            const value = source.slice(start,end);
            const token = lexer.token;
            if (token.at !== start || token.value !== value || kinds[symbols[id*3+2]] !== token.kind ||
                source.slice(symbols[id*3],symbols[id*3+1]) !== value ||
                id*3+2 >= symbols.length || end !== lexer.offset || token.kind === "eof")
                throw new Error("index diverges from reference token at "+start+" in "+source.slice(0,45));
            if (ids.has(value) && ids.get(value) !== id) throw new Error("duplicate symbol");
            ids.set(value,id);
            if (value === "{") opened.push(closing);
            else if (value === "}" && opened.pop() !== i/4+1) throw new Error("incorrect closing brace");
            if (value !== "{" && closing !== 0) throw new Error("nonopening row has a closing brace");
            lexer.next();
        }
        if (lexer.token.kind !== "eof" || opened.length || ids.size*3 !== symbols.length) throw new Error(JSON.stringify({source:source.slice(0,400),last:lexer.token,opens:opened.length,ids:ids.size,expected:symbols.length/3}));
        checked++;
        total += rows.length/4;
    }
    const atoms = ["{}", "{x {42} }", " alpha ", "_0A9", "999", "<= >= === !== >> && || = = ! ",
        '"ä中😀"', '"\\uD800"', '"' + String.fromCharCode(0xd800) + '"', '"\\u1234"', '"\\r\\t\\/\\"\\""', "// 😀 \r x\n", "\t \v\f\r\n", '"\u2028☕"', "/*{}*/"];
    for (const atom of atoms) check(atom + " x");
    let seed=1789;
    function next() { seed=(Math.imul(1664525,seed)+1013904223)>>>0; return seed; }
    for (let i=0;i<2500;i++) {
        let source="";
        for (let j=0;j<20;j++) source += atoms[next()%atoms.length] + " ";
        check(source + " x");
    }
    for (const source of ["// only\n", "x // ends here", '"', '"\\x"', '"\t"', "x |", "{", "}", "x &", "\u00a0a", "x\0", '"\\u0ABG"']) {
        if (__typedLexIndex(source)!==null) throw new Error("expected reference fallback");
        check(source,false);
    }
    for (const path of scriptArgs) check(readText(path));
    // The token table alone would need 4.8 MB under a 4 MiB runtime limit.
    // A decline must release partial allocations before the next small compile.
    const crowded = "a ".repeat(300000);
    for (let trial=0;trial<3;trial++) {
        if (__typedLexIndex(crowded) !== null) throw new Error("expected allocation decline");
        check("function fine() : i32 { return 42; }");
    }
    print(JSON.stringify({checked,totalTokens:total,declined,allocationDeclines:3}));
})();
