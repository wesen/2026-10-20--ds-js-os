// Count dynamic parser decisions in a fresh vendored QuickJS runtime. Never time this probe.
(() => {
    const lexer = typedWasm.Lexer.prototype;
    const emitter = typedWasm.FunctionEmitter.prototype;
    const accept = lexer.accept;
    const counts = Object.create(null);
    const entries = Object.create(null);
    let consumer = "declarations";
    for (const name of ["statement", "prefix", "expr", "function", "assignment", "call"]) {
        const original = emitter[name];
        if (!original) continue;
        emitter[name] = function (...args) {
            const previous = consumer;
            consumer = name;
            entries[name] = (entries[name] || 0) + 1;
            try { return original.apply(this, args); }
            finally { consumer = previous; }
        };
    }
    lexer.accept = function (value) {
        const row = counts[consumer] || (counts[consumer] = {matches:0, misses:0, byToken:Object.create(null)});
        const token = row.byToken[value] || (row.byToken[value] = [0,0]);
        const result = accept.call(this, value);
        if (result) { row.matches++; token[0]++; } else { row.misses++; token[1]++; }
        return result;
    };
    const source = readText(scriptArgs[0]);
    const imports = typedWorld.imports;
    const indexed = imports.map((fn,index) => ({...fn,index}));
    const output = typedWasm.compileFunctions(source, imports.length, indexed, 96*1024);
    print(JSON.stringify({sourceUnits:source.length,functions:output.functions.length,entries,counts}));
})();
