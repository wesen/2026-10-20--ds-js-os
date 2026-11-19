// Evaluated after each compiler lane in its own bare QuickJS context.
(() => {
    "use strict";
    const imports = JSON.parse(__imports);
    const maxSourceLength = 96 * 1024;
    const indexed = imports.map((signature, index) => ({...signature, index}));
    let prepared;

    globalThis.runCompile = () => typedRv32.compile(__source, imports, maxSourceLength);
    globalThis.runFront = () => typedWasm.compileFunctions(__source, imports.length, indexed, maxSourceLength);
    globalThis.prepareLower = () => { prepared = {...runFront(), imported: indexed}; };
    globalThis.runLower = () => typedRv32.lowerPrepared(prepared);

    function serialize(program) {
        const {image, ...metadata} = program;
        return {
            hex: Array.from(image, byte => byte.toString(16).padStart(2, "0")).join(""),
            metadata,
        };
    }

    globalThis.verify = () => {
        try {
            const compiled = serialize(runCompile());
            if (typedRv32.lowerPrepared === undefined) return JSON.stringify({compiled});
            prepareLower();
            const frontend = {
                codeCells: prepared.functions.reduce((n, f) => n + f.code.length, 0),
                maxFunctionCells: prepared.functions.reduce((n, f) => Math.max(n, f.code.length), 0),
                framedCells: prepared.functions.reduce((n, f) => n + (f.body?.length ?? 0), 0),
                functionCount: prepared.functions.length,
            };
            const replay = serialize(runLower());
            if (JSON.stringify(replay) !== JSON.stringify(compiled)) throw new Error("replay and compile disagree");
            return JSON.stringify({compiled, frontend});
        } catch (error) {
            return JSON.stringify({error: error.message, errorClass: error.name});
        }
    };

    globalThis.inspectFunction = () => JSON.stringify(runFront().functions[0]);
})();
