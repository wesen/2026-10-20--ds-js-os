// Evaluated inside the ticket's C/QuickJS phase timing driver.
(() => {
    const source = __source;
    const imports = typedWorld.imports;
    const reactor = new Uint8Array(__wasmReactor);
    const runs = 9;
    function measure(fn) {
        fn();
        const rows = [];
        for (let i = 0; i < runs; i++) {
            for (const key of Object.keys(globalThis.__signatureExperiment ?? {}))
                delete globalThis.__signatureExperiment[key];
            const t0 = __now();
            const result = fn();
            const duration = __now() - t0;
            rows.push({duration, result, phases: {...globalThis.__signatureExperiment}});
        }
        return rows;
    }
    const wasm = measure(() => compileTypedWorld(source, reactor).length);
    const rv32 = measure(() => typedRv32.compile(source, imports, 96 * 1024).image.length);
    const elf = typeof __elfReactor === "undefined"
        ? undefined : measure(() => compileTypedWorldRv32(source, new Uint8Array(__elfReactor)).length);
    __print(JSON.stringify({loadedMs: __loadMs, sourceUnits:source.length, wasm, rv32, elf}));
})();
