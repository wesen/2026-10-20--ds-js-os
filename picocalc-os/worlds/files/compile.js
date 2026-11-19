// The reactor and the typed program share the layouts and signatures in slots.h.
(() => {
    "use strict";

    const signatures = [
        ["filesName", "string,buffer"],
        ["filesCompare", "string,bool,string,bool"],
        ["filesSelect", "i32,i32,i32"],
        ["filesAction", "i32,bool,bool,i32,bool"],
    ];
    const entries = signatures.map(([name]) => name);

    function validate(functions) {
        for (const [name, params] of signatures) {
            const entry = functions.find(fn => fn.name === name);
            if (!entry || entry.result !== "i32" || entry.params.join(",") !== params)
                throw new SyntaxError("Files requires " + name + "(" + params + "): i32");
        }
    }

    globalThis.compileFiles = function compileFiles(source, reactor) {
        const {bytes, signatures} = typedWasm.linkWorld(source, reactor, entries);
        validate(signatures);
        return bytes;
    };

    globalThis.compileFilesRv32 = function compileFilesRv32(source, reactor) {
        const program = typedRv32.compile(source);
        validate(program.signatures);
        return typedRv32.linkSlot(program, reactor, entries);
    };
})();
