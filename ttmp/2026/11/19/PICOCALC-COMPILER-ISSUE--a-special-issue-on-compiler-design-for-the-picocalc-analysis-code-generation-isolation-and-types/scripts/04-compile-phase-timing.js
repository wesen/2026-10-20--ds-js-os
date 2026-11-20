// Driver evaluated inside QuickJS by 04-compile-phase-timing.c.
(() => {
    const source = __source;
    const worldSrc = __compilerText;
    // The compiler's own tokenizer pattern, taken from its source text so the two cannot drift.
    const tokenLine = /const TOKEN = (\/.*\/y);/.exec(worldSrc)[1];
    const TOKEN = eval(tokenLine);
    const imports = [];   // filled from compileTypedWorld's own table below
    function median(xs) { const s = xs.slice().sort((a, b) => a - b); return s[s.length >> 1]; }
    function time(label, fn, runs) {
        fn();                                   // warm-up (QuickJS has no JIT; this fills caches only)
        const samples = [];
        for (let i = 0; i < runs; i++) { const t = __now(); fn(); samples.push(__now() - t); }
        return [label, median(samples), Math.min(...samples), Math.max(...samples)];
    }
    const wasmReactor = new Uint8Array(__wasmReactor);
    const rows = [];
    const runs = 15;
    let tokens = 0;
    rows.push(time("tokenize only (the compiler's regex, no parsing)", () => {
        let at = 0; tokens = 0;
        while (true) {
            TOKEN.lastIndex = at;
            const m = TOKEN.exec(source);
            if (!m) break;
            at = TOKEN.lastIndex; tokens++;
        }
    }, runs));
    const importRows = [];
    const rowPattern = /\["(typedSdk\w+)", "([^"]*)", "(\w+)"(?:, true)?\]/g;
    let row;
    while ((row = rowPattern.exec(__worldText))) importRows.push({name: row[1], params: row[2] ? row[2].split(",") : [], result: row[3]});
    const imported = importRows.map((fn, index) => ({name: fn.name, params: fn.params, result: fn.result, index}));
    let functions = 0, rv32Bytes = 0;
    rows.push(time("frontend only: parse, check, emit Wasm function bodies", () => {
        functions = typedWasm.compileFunctions(source, importRows.length, imported, 96 * 1024).functions.length;
    }, runs));
    rows.push(time("frontend + RV32 lowering (no ELF link)", () => {
        rv32Bytes = typedRv32.compile(source, importRows, 96 * 1024).image.length;
    }, runs));
    let wasmBytes = 0, elfBytes = 0;
    rows.push(time("Wasm world: parse, check, emit, link into reactor", () => { wasmBytes = compileTypedWorld(source, wasmReactor).length; }, runs));
    if (typeof __elfReactor !== "undefined") {
        const elfReactor = new Uint8Array(__elfReactor);
        rows.push(time("RV32 world: parse, check, emit, lower, link into ELF slot", () => { elfBytes = compileTypedWorldRv32(source, elfReactor).length; }, runs));
    }
    __print("compiler load (evaluate three compiler files): " + __loadMs.toFixed(2) + " ms");
    __print("source: " + source.length + " UTF-16 units, " + tokens + " tokens; Wasm module " + wasmBytes + " bytes; RV32 ELF " + elfBytes + " bytes");
    for (const [label, med, lo, hi] of rows) __print(label + ": median " + med.toFixed(2) + " ms (min " + lo.toFixed(2) + ", max " + hi.toFixed(2) + ", " + runs + " runs)");
    __print("heap in use after runs: " + __memory() + " bytes");
})();
